var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var misc = require("./fs-misc");
var sources = require("./fs-sources");
var targets = require("./fs-targets");
var util = require("./util");
var glob = require("./fs-glob");
var events = require("events");
var FileUtil = misc.FileUtil;
var Path = misc.Path;
var FileDataTarget = targets.FileDataTarget;
var StringDataTarget = targets.StringDataTarget;
var BufferDataTarget = targets.BufferDataTarget;
var FileDataSource = sources.FileDataSource;
var toDataSource = sources.toDataSource;
var Task = util.Task;
var wrapCallback = util.wrapCallback;
var EventEmitter = events.EventEmitter;
var search = glob.search;
var FilesystemPlus = (function (_super) {
    __extends(FilesystemPlus, _super);
    function FilesystemPlus(fs, local) {
        _super.call(this);
        this._fs = fs;
        this._local = local;
    }
    FilesystemPlus.prototype.open = function (path, flags, attrs, callback) {
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = attrs;
            attrs = null;
        }
        callback = wrapCallback(this, null, callback);
        this._fs.open(path, flags, attrs, callback);
    };
    FilesystemPlus.prototype.close = function (handle, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.close(handle, callback);
    };
    FilesystemPlus.prototype.read = function (handle, buffer, offset, length, position, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.read(handle, buffer, offset, length, position, callback);
    };
    FilesystemPlus.prototype.write = function (handle, buffer, offset, length, position, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.write(handle, buffer, offset, length, position, callback);
    };
    FilesystemPlus.prototype.lstat = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.lstat(path, callback);
    };
    FilesystemPlus.prototype.fstat = function (handle, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.fstat(handle, callback);
    };
    FilesystemPlus.prototype.setstat = function (path, attrs, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.setstat(path, attrs, callback);
    };
    FilesystemPlus.prototype.fsetstat = function (handle, attrs, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.fsetstat(handle, attrs, callback);
    };
    FilesystemPlus.prototype.opendir = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.opendir(path, callback);
    };
    FilesystemPlus.prototype.readdir = function (handle, callback) {
        if (typeof handle === 'string') {
            var path = Path.check(handle, 'path');
            var options = {
                noglobstar: true,
                nowildcard: true,
                listonly: true,
                dotdirs: true
            };
            search(this._fs, path, null, options, callback);
            return;
        }
        callback = wrapCallback(this, null, callback);
        return this._fs.readdir(handle, callback);
    };
    FilesystemPlus.prototype.unlink = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.unlink(path, callback);
    };
    FilesystemPlus.prototype.mkdir = function (path, attrs, callback) {
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = attrs;
            attrs = null;
        }
        callback = wrapCallback(this, null, callback);
        this._fs.mkdir(path, attrs, callback);
    };
    FilesystemPlus.prototype.rmdir = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.rmdir(path, callback);
    };
    FilesystemPlus.prototype.realpath = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.realpath(path, callback);
    };
    FilesystemPlus.prototype.stat = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.stat(path, callback);
    };
    FilesystemPlus.prototype.rename = function (oldPath, newPath, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.rename(oldPath, newPath, callback);
    };
    FilesystemPlus.prototype.readlink = function (path, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.readlink(path, callback);
    };
    FilesystemPlus.prototype.symlink = function (targetpath, linkpath, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.symlink(targetpath, linkpath, callback);
    };
    FilesystemPlus.prototype.join = function () {
        var paths = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            paths[_i - 0] = arguments[_i];
        }
        var path = new Path("", this._fs);
        return path.join.apply(path, arguments).normalize().path;
    };
    FilesystemPlus.prototype.link = function (oldPath, newPath, callback) {
        callback = wrapCallback(this, null, callback);
        this._fs.link(oldPath, newPath, callback);
    };
    FilesystemPlus.prototype.list = function (remotePath, callback) {
        var remotePath = Path.check(remotePath, 'remotePath');
        var options = {
            directories: true,
            files: true,
            nosort: false,
            dotdirs: false,
            noglobstar: true,
            listonly: true
        };
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        search(this._fs, remotePath, task, options, callback);
        return task;
    };
    FilesystemPlus.prototype.search = function (remotePath, options, callback) {
        var remotePath = Path.check(remotePath, 'remotePath');
        if (typeof options === 'function' && typeof callback === 'undefined') {
            callback = options;
            options = null;
        }
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        search(this._fs, remotePath, task, options, callback);
        return task;
    };
    FilesystemPlus.prototype.info = function (remotePath, callback) {
        var remotePath = Path.check(remotePath, 'remotePath');
        var options = {
            itemonly: true
        };
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        search(this._fs, remotePath, task, options, function (err, items) {
            if (err)
                return callback(err, null);
            if (!items || items.length != 1)
                return callback(new Error("Unexpected result"), null);
            callback(null, items[0]);
        });
        return task;
    };
    FilesystemPlus.prototype.readFile = function (remotePath, options, callback) {
        var remote = Path.create(remotePath, this._fs, 'remotePath');
        if (typeof options === 'function' && typeof callback === 'undefined') {
            callback = options;
            options = null;
        }
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        // process options
        options = options || {};
        var type = options.type;
        var encoding = options.encoding;
        if (type) {
            type = (type + "").toLowerCase();
            if (type == "string" || type == "text")
                encoding = encoding || "utf8";
        }
        else {
            type = encoding ? "string" : "buffer";
        }
        // create appropriate target
        var target;
        switch (type) {
            case "text":
            case "string":
                target = new StringDataTarget(encoding);
                break;
            case "array":
            case "buffer":
                target = new BufferDataTarget();
                break;
            case "blob":
            // WEB: target = new BlobDataTarget(options.mimeType);
            // WEB: break;
            default:
                throw new Error("Unsupported data kind: " + options.type);
        }
        // create source
        var source = new FileDataSource(remote.fs, remote.path);
        // copy file data
        FileUtil.copy(source, target, task, function (err) {
            if (err)
                return callback(err, null);
            callback(null, target.result());
        });
        return task;
    };
    FilesystemPlus.prototype.putFile = function (localPath, remotePath, callback) {
        var local = Path.create(localPath, this._local, 'localPath');
        var remote = Path.create(remotePath, this._fs, 'remotePath');
        return this._copyFile(local, remote, callback);
    };
    FilesystemPlus.prototype.getFile = function (remotePath, localPath, callback) {
        var remote = Path.create(remotePath, this._fs, 'remotePath');
        var local = Path.create(localPath, this._local, 'localPath');
        return this._copyFile(remote, local, callback);
    };
    FilesystemPlus.prototype._copyFile = function (sourcePath, targetPath, callback) {
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        // append filename if target path ens with slash
        if (targetPath.endsWithSlash()) {
            var filename = sourcePath.getName();
            targetPath = targetPath.join(filename);
        }
        // create source and target
        var source = new FileDataSource(sourcePath.fs, sourcePath.path);
        var target = new FileDataTarget(targetPath.fs, targetPath.path);
        // copy file data
        FileUtil.copy(source, target, task, function (err) { return callback(err); });
        return task;
    };
    FilesystemPlus.prototype.upload = function (input, remotePath, callback) {
        var remote = Path.create(remotePath, this._fs, 'remotePath');
        return this._copy(input, this._local, remote, callback);
    };
    FilesystemPlus.prototype.download = function (remotePath, localPath, callback) {
        var local = Path.create(localPath, this._local, 'localPath');
        return this._copy(remotePath, this._fs, local, callback);
    };
    FilesystemPlus.prototype._copy = function (from, fromFs, toPath, callback) {
        var task = new Task();
        callback = wrapCallback(this, task, callback);
        var sources = null;
        var toFs = toPath.fs;
        toPath = toPath.removeTrailingSlash();
        toFs.stat(toPath.path, prepare);
        var directories = {};
        return task;
        function prepare(err, stats) {
            if (err)
                return callback(err);
            if (!FileUtil.isDirectory(stats))
                return callback(new Error("Target path is not a directory"));
            try {
                toDataSource(fromFs, from, task, function (err, src) {
                    if (err)
                        return callback(err);
                    try {
                        sources = src;
                        sources.forEach(function (source) {
                            //TODO: calculate total size
                            //TODO: make sure that source.name is valid on target fs
                        });
                        next();
                    }
                    catch (err) {
                        callback(err);
                    }
                });
            }
            catch (err) {
                callback(err);
            }
        }
        function next() {
            var source = sources.shift();
            if (!source)
                return callback(null);
            var targetPath;
            if (typeof source.relativePath === "string") {
                var relativePath = new Path(source.relativePath, fromFs);
                targetPath = toPath.join(relativePath).normalize().path;
                checkParent(relativePath, transfer);
            }
            else {
                targetPath = toPath.join(source.name).path;
                transfer(null);
            }
            function transfer(err) {
                if (err)
                    return callback(err);
                if (FileUtil.isDirectory(source.stats)) {
                    FileUtil.mkdir(toFs, targetPath, transferred);
                }
                else {
                    var target = new FileDataTarget(toFs, targetPath);
                    FileUtil.copy(source, target, task, transferred);
                }
            }
            function transferred(err) {
                if (err)
                    return callback(err);
                next();
            }
        }
        function checkParent(path, callback) {
            var parent = path.getParent();
            if (parent.isTop())
                return callback(null);
            var exists = directories[parent];
            if (exists)
                return callback(null);
            checkParent(parent, function (err) {
                if (err)
                    return callback(err);
                try {
                    var targetPath = toPath.join(parent).path;
                    FileUtil.mkdir(toFs, targetPath, function (err) {
                        if (err)
                            return callback(err);
                        directories[parent] = true;
                        callback(null);
                    });
                }
                catch (err) {
                    callback(err);
                }
            });
        }
    };
    return FilesystemPlus;
})(EventEmitter);
exports.FilesystemPlus = FilesystemPlus;
