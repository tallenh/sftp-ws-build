var fs = require("fs");
var misc = require("./fs-misc");
var Path = misc.Path;
var FileUtil = misc.FileUtil;
var LocalError = (function () {
    function LocalError(message, isPublic) {
        this.name = "Error";
        this.message = message;
        this.isPublic = (isPublic === true);
    }
    return LocalError;
})();
var LocalFilesystem = (function () {
    function LocalFilesystem() {
        this.isWindows = (process.platform === 'win32');
    }
    LocalFilesystem.prototype.checkPath = function (path, name) {
        var localPath = Path.create(path, this, name);
        var path = localPath.path;
        if (path[0] == '~') {
            var home = (process.env.HOME || process.env.USERPROFILE || ".");
            if (path.length == 1)
                return home;
            if (path[1] === '/' || (path[1] === '\\' && this.isWindows)) {
                path = localPath.join(home, path.substr(2)).path;
            }
        }
        return path;
    };
    LocalFilesystem.prototype.open = function (path, flags, attrs, callback) {
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = attrs;
            attrs = null;
        }
        path = this.checkPath(path, 'path');
        var mode = (attrs && typeof attrs === 'object') ? attrs.mode : undefined;
        fs.open(path, flags, mode, function (err, fd) { return callback(err, fd); });
        //LATER: pay attemtion to attrs other than mode (low priority - many SFTP servers ignore these as well)
    };
    LocalFilesystem.prototype.close = function (handle, callback) {
        var err = null;
        if (Array.isArray(handle)) {
            if (handle.closed == true)
                err = new LocalError("Already closed", true);
            else
                handle.closed = true;
        }
        else if (!isNaN(handle)) {
            fs.close(handle, callback);
            return;
        }
        else {
            err = new LocalError("Invalid handle", true);
        }
        if (typeof callback == 'function') {
            process.nextTick(function () {
                callback(err);
            });
        }
    };
    LocalFilesystem.prototype.read = function (handle, buffer, offset, length, position, callback) {
        var initialOffset = offset;
        var totalBytes = 0;
        var read = function () {
            fs.read(handle, buffer, offset, length, position, function (err, bytesRead, b) {
                if (typeof err === 'undefined' || err == null) {
                    length -= bytesRead;
                    totalBytes += bytesRead;
                    if (length > 0 && bytesRead > 0) {
                        offset += bytesRead;
                        position += bytesRead;
                        read();
                        return;
                    }
                }
                if (typeof callback === 'function')
                    callback(err, totalBytes, buffer);
            });
        };
        read();
    };
    LocalFilesystem.prototype.write = function (handle, buffer, offset, length, position, callback) {
        var write = function () {
            fs.write(handle, buffer, offset, length, position, function (err, bytesWritten, b) {
                if (typeof err === 'undefined' || err == null) {
                    length -= bytesWritten;
                    if (length > 0) {
                        offset += bytesWritten;
                        position += bytesWritten;
                        write();
                        return;
                    }
                }
                if (typeof callback === 'function')
                    callback(err);
            });
        };
        write();
    };
    LocalFilesystem.prototype.lstat = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.lstat(path, callback);
    };
    LocalFilesystem.prototype.fstat = function (handle, callback) {
        fs.fstat(handle, callback);
    };
    LocalFilesystem.prototype.run = function (actions, callback) {
        if (actions.length == 0) {
            if (typeof callback == 'function') {
                process.nextTick(callback);
                callback(null);
            }
            return;
        }
        var action = actions.shift();
        var next = function (err) {
            if (typeof err !== 'undefined' && err != null) {
                if (typeof callback == 'function')
                    callback(err);
                return;
            }
            if (actions.length == 0) {
                if (typeof callback == 'function')
                    callback(null);
                return;
            }
            action = actions.shift();
            action(next);
        };
        action(next);
    };
    LocalFilesystem.prototype.setstat = function (path, attrs, callback) {
        path = this.checkPath(path, 'path');
        var actions = new Array();
        if (!isNaN(attrs.uid) || !isNaN(attrs.gid))
            actions.push(function (next) { fs.chown(path, attrs.uid, attrs.gid, function (err) { return next(err); }); });
        if (!isNaN(attrs.mode))
            actions.push(function (next) { fs.chmod(path, attrs.mode, function (err) { return next(err); }); });
        if (!isNaN(attrs.size))
            actions.push(function (next) { fs.truncate(path, attrs.size, function (err) { return next(err); }); });
        if (typeof attrs.atime === 'object' || typeof attrs.mtime === 'object') {
            //var atime = (typeof attrs.atime.getTime === 'function') ? attrs.atime.getTime() : undefined;
            //var mtime = (typeof attrs.mtime.getTime === 'function') ? attrs.mtime.getTime() : undefined;
            var atime = attrs.atime;
            var mtime = attrs.mtime;
            actions.push(function (next) { fs.utimes(path, atime, mtime, function (err) { return next(err); }); });
        }
        this.run(actions, callback);
    };
    LocalFilesystem.prototype.fsetstat = function (handle, attrs, callback) {
        var actions = new Array();
        if (!isNaN(attrs.uid) || !isNaN(attrs.gid))
            actions.push(function (next) { fs.fchown(handle, attrs.uid, attrs.gid, function (err) { return next(err); }); });
        if (!isNaN(attrs.mode))
            actions.push(function (next) { fs.fchmod(handle, attrs.mode, function (err) { return next(err); }); });
        if (!isNaN(attrs.size))
            actions.push(function (next) { fs.ftruncate(handle, attrs.size, function (err) { return next(err); }); });
        if (typeof attrs.atime === 'object' || typeof attrs.mtime === 'object') {
            //var atime = (typeof attrs.atime.getTime === 'function') ? attrs.atime.getTime() : undefined;
            //var mtime = (typeof attrs.mtime.getTime === 'function') ? attrs.mtime.getTime() : undefined;
            var atime = attrs.atime;
            var mtime = attrs.mtime;
            actions.push(function (next) { fs.futimes(handle, atime, mtime, function (err) { return next(err); }); });
        }
        this.run(actions, callback);
    };
    LocalFilesystem.prototype.opendir = function (path, callback) {
        var _this = this;
        path = this.checkPath(path, 'path');
        fs.readdir(path, function (err, files) {
            if (files)
                files.splice(0, 0, ".", "..");
            if (typeof err !== 'undefined' && err != null) {
                files = null;
            }
            else if (Array.isArray(files)) {
                files["path"] = new Path(path, _this).normalize();
                err = null;
            }
            else {
                files = null;
                err = new LocalError("Unable to read directory", true);
                err.path = path;
            }
            if (typeof callback === 'function')
                callback(err, files);
        });
    };
    LocalFilesystem.prototype.readdir = function (handle, callback) {
        var err = null;
        var path = null;
        if (Array.isArray(handle)) {
            if (handle.closed == true) {
                err = new LocalError("Already closed", true);
            }
            else {
                path = handle.path;
                if (typeof path !== 'object')
                    err = new LocalError("Invalid handle", true);
            }
        }
        else {
            err = new LocalError("Invalid handle", true);
        }
        var windows = this.isWindows;
        var items = [];
        if (err == null) {
            var paths = handle.splice(0, 64);
            if (paths.length > 0) {
                function next() {
                    var name = paths.shift();
                    if (!name) {
                        if (typeof callback == 'function') {
                            callback(null, (items.length > 0) ? items : false);
                        }
                        return;
                    }
                    var itemPath = path.join(name).path;
                    fs.stat(itemPath, function (err, stats) {
                        if (typeof err !== 'undefined' && err != null) {
                        }
                        else {
                            //
                            items.push({
                                filename: name,
                                longname: FileUtil.toString(name, stats),
                                stats: stats
                            });
                        }
                        next();
                    });
                }
                ;
                next();
                return;
            }
        }
        if (typeof callback == 'function') {
            process.nextTick(function () {
                callback(err, err == null ? false : null);
            });
        }
    };
    LocalFilesystem.prototype.unlink = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.unlink(path, callback);
    };
    LocalFilesystem.prototype.mkdir = function (path, attrs, callback) {
        path = this.checkPath(path, 'path');
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = attrs;
            attrs = null;
        }
        var mode = (attrs && typeof attrs === 'object') ? attrs.mode : undefined;
        fs.mkdir(path, mode, callback);
        //LATER: pay attemtion to attrs other than mode (low priority - many SFTP servers ignore these as well)
    };
    LocalFilesystem.prototype.rmdir = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.rmdir(path, callback);
    };
    LocalFilesystem.prototype.realpath = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.realpath(path, callback);
    };
    LocalFilesystem.prototype.stat = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.stat(path, callback);
    };
    LocalFilesystem.prototype.rename = function (oldPath, newPath, callback) {
        oldPath = this.checkPath(oldPath, 'oldPath');
        newPath = this.checkPath(newPath, 'newPath');
        fs.rename(oldPath, newPath, callback);
    };
    LocalFilesystem.prototype.readlink = function (path, callback) {
        path = this.checkPath(path, 'path');
        fs.readlink(path, callback);
    };
    LocalFilesystem.prototype.symlink = function (targetPath, linkPath, callback) {
        targetPath = this.checkPath(targetPath, 'targetPath');
        linkPath = this.checkPath(linkPath, 'linkPath');
        //TODO: make sure the order is correct (beware - other SFTP client and server vendors are confused as well)
        //TODO: make sure this work on Windows
        fs.symlink(linkPath, targetPath, 'file', callback);
    };
    LocalFilesystem.prototype.link = function (oldPath, newPath, callback) {
        oldPath = this.checkPath(oldPath, 'oldPath');
        newPath = this.checkPath(newPath, 'newPath');
        fs.link(oldPath, newPath, callback);
    };
    return LocalFilesystem;
})();
exports.LocalFilesystem = LocalFilesystem;
