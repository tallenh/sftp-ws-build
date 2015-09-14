var Path = (function () {
    function Path(path, fs) {
        if (typeof path !== "string")
            path = "" + path;
        this.path = path;
        this.fs = fs || null;
    }
    Path.prototype._windows = function () {
        return this.fs && this.fs.isWindows && true;
    };
    Path.prototype.isTop = function () {
        var path = this.path;
        if (path.length == 0 || path == '/')
            return true;
        if (this._windows()) {
            if (path == '\\')
                return true;
            if (path[1] != ':')
                return false;
            if (path.length == 2)
                return true;
            if (path.length == 3 && (path[2] == '/' || path[2] == '\\'))
                return true;
        }
        return false;
    };
    Path.prototype.getName = function () {
        var path = this.path;
        var windows = this._windows();
        var n = path.lastIndexOf('/');
        if (n < 0 && windows)
            n = path.lastIndexOf('\\');
        if (n < 0)
            return path;
        return path.substr(n + 1);
    };
    Path.prototype.getParent = function () {
        var path = this.path;
        var windows = this._windows();
        var n = path.lastIndexOf('/');
        if (n < 0 && windows)
            n = path.lastIndexOf('\\');
        if (n < 0) {
            path = "";
        }
        else if (n == 0) {
            path = "/";
        }
        else {
            path = path.substr(0, n);
        }
        return new Path(path, this.fs);
    };
    Path.prototype.startsWith = function (value) {
        if (value.length == 0)
            return false;
        var path = this.path;
        if (path.length < value.length)
            return false;
        if (value.length == 1)
            return path[0] === value;
        for (var i = 0; i < value.length; i++) {
            if (value[i] !== path[i])
                return false;
        }
        return true;
    };
    Path.prototype.endsWithSlash = function () {
        var last = this.path[this.path.length - 1];
        if (last == '/')
            return true;
        if (last == '\\' && this._windows())
            return true;
        return false;
    };
    Path.prototype.removeTrailingSlash = function () {
        var path = this.path;
        var windows = this._windows();
        var len = path.length;
        if (len > 1) {
            var last = path[len - 1];
            if (last == '/' || (last == '\\' && windows))
                path = path.substr(0, len - 1);
        }
        return new Path(path, this.fs);
    };
    Path.prototype.normalize = function () {
        var path = this.path;
        // replace slashes with backslashes with on Windows filesystems
        if (this._windows()) {
            path = path.replace(/\//g, "\\");
        }
        else {
            path = path.replace(/\\/g, "/");
        }
        return new Path(path, this.fs);
    };
    Path.prototype.toString = function () {
        return this.path;
    };
    Path.prototype.join = function () {
        var paths = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            paths[_i - 0] = arguments[_i];
        }
        var path = "" + this.path;
        var windows = this._windows();
        paths.forEach(function (segment) {
            if (typeof segment === "undefined")
                return;
            segment = "" + segment;
            if (segment.length == 0)
                return;
            if (path.length == 0 || segment[0] === '/' || segment === "~" || (segment[0] === '~' && segment[1] === '/')) {
                path = segment;
                return;
            }
            if (windows) {
                if (segment[0] === '\\' || (segment[0] === '~' && segment[1] === '\\') || segment[1] === ':') {
                    path = segment;
                    return;
                }
            }
            var last = path[path.length - 1];
            if (last === '/' || (windows && last === '\\')) {
                path = path + segment;
            }
            else {
                path = path + "/" + segment;
            }
        });
        if (path.length == 0) {
            path = ".";
        }
        else if (windows) {
            path = path.replace(/\//g, '\\');
        }
        return new Path(path, this.fs);
    };
    Path.create = function (path, fs, name) {
        path = Path.check(path, name);
        return new Path(path, fs).normalize();
    };
    Path.check = function (path, name) {
        if (typeof name === "undefined")
            name = "path";
        if (typeof path !== "string") {
            if (path === null || typeof path === "undefined")
                throw new Error("Missing " + name);
            if (typeof path === 'function')
                throw new Error("Invalid " + name);
            path = "" + path;
        }
        if (path.length == 0)
            throw new Error("Empty " + name);
        return path;
    };
    return Path;
})();
exports.Path = Path;
var FileUtil = (function () {
    function FileUtil() {
    }
    FileUtil.isDirectory = function (stats) {
        return stats ? (stats.mode & 61440 /* ALL */) == 16384 /* DIRECTORY */ : false; // directory
    };
    FileUtil.isFile = function (stats) {
        return stats ? (stats.mode & 61440 /* ALL */) == 32768 /* REGULAR_FILE */ : false; // regular file
    };
    FileUtil.toString = function (filename, stats) {
        var attrs = stats.mode;
        var perms;
        switch (attrs & 61440 /* ALL */) {
            case 8192 /* CHARACTER_DEVICE */:
                perms = "c";
                break;
            case 16384 /* DIRECTORY */:
                perms = "d";
                break;
            case 24576 /* BLOCK_DEVICE */:
                perms = "b";
                break;
            case 32768 /* REGULAR_FILE */:
                perms = "-";
                break;
            case 40960 /* SYMLINK */:
                perms = "l";
                break;
            case 49152 /* SOCKET */:
                perms = "s";
                break;
            case 4096 /* FIFO */:
                perms = "p";
                break;
            default:
                perms = "-";
                break;
        }
        attrs &= 0x1FF;
        for (var j = 0; j < 3; j++) {
            var mask = (attrs >> ((2 - j) * 3)) & 0x7;
            perms += (mask & 4) ? "r" : "-";
            perms += (mask & 2) ? "w" : "-";
            perms += (mask & 1) ? "x" : "-";
        }
        var len = stats.size.toString();
        if (len.length < 9)
            len = "         ".slice(len.length - 9) + len;
        else
            len = " " + len;
        var modified = stats.mtime;
        var diff = (new Date().getTime() - modified.getTime()) / (3600 * 24);
        var date = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][modified.getUTCMonth()];
        var day = modified.getUTCDate();
        date += ((day <= 9) ? "  " : " ") + day;
        if (diff < -30 || diff > 180)
            date += "  " + modified.getUTCFullYear();
        else
            date += " " + ("0" + modified.getUTCHours()).slice(-2) + ":" + ("0" + modified.getUTCMinutes()).slice(-2);
        var nlink = (typeof stats.nlink === 'undefined') ? 1 : stats.nlink;
        return perms + " " + nlink + " user group " + len + " " + date + " " + filename;
    };
    FileUtil.mkdir = function (fs, path, callback) {
        fs.stat(path, function (err, stats) {
            if (!err) {
                if (FileUtil.isDirectory(stats))
                    return callback(null);
                return callback(new Error("Path is not a directory")); //TODO: better error
            }
            if (err.code != "ENOENT")
                return callback(err);
            fs.mkdir(path, null, callback);
        });
    };
    FileUtil.copy = function (source, target, emitter, callback) {
        var empty = true;
        var writable = true;
        var eof = false;
        var done = false;
        var error = null;
        var total = 0;
        var item = null;
        source.on("readable", function () {
            //console.log("readable");
            if (item == null)
                transferring();
            while (writable) {
                if (!copy())
                    break;
            }
        });
        source.on("end", function () {
            //console.log("ended");
            eof = true;
            if (empty && target.acceptsEmptyBlocks)
                target.write(new Buffer(0));
            target.end();
        });
        source.on("error", function (err) {
            //console.log("read error", err);
            error = error || err || new Error("Unspecified error");
            eof = true;
            target.end();
        });
        target.on("drain", function () {
            //console.log("drained");
            writable = true;
            do {
                if (!copy())
                    break;
            } while (writable);
        });
        target.on("finish", function () {
            //console.log("finished");
            if (item)
                emitter.emit("transferred", item);
            exit();
        });
        target.on("error", function (err) {
            //console.log("write error", err);
            error = error || err || new Error("Unspecified error");
            exit();
        });
        function transferring() {
            var name = source.name;
            if (typeof name === "undefined")
                name = "" + target.name;
            var path = source.relativePath;
            if (typeof path === "undefined")
                path = name;
            item = {
                filename: name,
                stats: source.stats || { size: source.length },
                path: path
            };
            emitter.emit("transferring", item);
        }
        function copy() {
            var chunk = source.read();
            if (!chunk)
                return false;
            empty = false;
            writable = target.write(chunk, function () {
                // The fact that write requests might in theory be completed in different order
                // doesn't concern us much because a transferred byte is still a transferred byte
                // and it will all add up to proper number in the end.
                total += chunk.length;
                emitter.emit("progress", source.path, total, source.length);
            });
            return writable;
        }
        function exit() {
            if (!eof)
                return source.close();
            if (!done) {
                done = true;
                callback(error);
            }
        }
    };
    return FileUtil;
})();
exports.FileUtil = FileUtil;
