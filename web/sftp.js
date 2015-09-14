//
//
//
//
//

var SFTP;
(function (SFTP) {
    function __extends(d, b) {
        for (var p in b)
            if (b.hasOwnProperty(p))
                d[p] = b[p];
        function __() { this.constructor = d; }
        __.prototype = b.prototype;
        d.prototype = new __();
    }
    var undefined;
    var EventEmitter = (function () {
        function EventEmitter() {
            this._events = {};
        }
        EventEmitter.listenerCount = function (emitter, event) {
            if (!emitter || typeof emitter._events === "undefined")
                return 0;
            var list = emitter._events[event];
            if (!list)
                return 0;
            return list.length;
        };
        EventEmitter.prototype.addListener = function (event, listener) {
            var list = this._events[event] || [];
            list.push(listener);
            this._events[event] = list;
            return this;
        };
        EventEmitter.prototype.on = function (event, listener) {
            return this.addListener(event, listener);
        };
        EventEmitter.prototype.once = function (event, listener) {
            var _this = this;
            var wrapper = function () {
                var args = [];
                for (var _i = 0; _i < arguments.length; _i++) {
                    args[_i - 0] = arguments[_i];
                }
                _this.removeListener(event, wrapper);
                listener.apply(_this, args);
            };
            return this.addListener(event, wrapper);
        };
        EventEmitter.prototype.removeListener = function (event, listener) {
            var list = this._events[event];
            if (!Array.isArray(list))
                return;
            var n = list.indexOf(listener);
            if (n >= 0)
                list.splice(n, 1);
            return this;
        };
        EventEmitter.prototype.removeAllListeners = function (event) {
            if (typeof event === 'string')
                delete this._events[event];
            else if (typeof event === 'undefined')
                this._events = {};
            return this;
        };
        EventEmitter.prototype.listeners = function (event) {
            return this._events[event];
        };
        EventEmitter.prototype.emit = function (event) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var list = this._events[event];
            var called = false;
            if (Array.isArray(list)) {
                for (var i = 0; i < list.length; i++) {
                    list[i].apply(null, args);
                    called = true;
                }
            }
            if (!called && event == "error") {
                var error = args[0];
                console.error(error);
                throw error;
            }
            return called;
        };
        return EventEmitter;
    })();
    var process = (function () {
        function process() {
        }
        process.nextTick = function (callback) {
            window.setTimeout(callback, 0);
        };
        process.platform = "browser";
        return process;
    })();
    function toLogWriter(writer) {
        function check(names) {
            if (typeof writer !== "object")
                return false;
            for (var i = 0; i < names.length; i++) {
                if (typeof writer[names[i]] !== "function")
                    return false;
            }
            return true;
        }
        ;
        var levels = ["trace", "debug", "info", "warn", "error", "fatal"];
        if (writer == null || typeof writer === "undefined") {
            // no writer specified, create a dummy writer
            var proxy = new Object();
            levels.forEach(function (level) {
                proxy[level] = function (obj, format) {
                    var params = [];
                    for (var _i = 2; _i < arguments.length; _i++) {
                        params[_i - 2] = arguments[_i];
                    }
                };
            });
            proxy["level"] = function () { return 90; };
            return proxy;
        }
        if (check(levels)) {
            // looks like bunyan, great!
            return writer;
        }
        if (check(["log", "info", "warn", "error", "dir"])) {
            // looks like console, lets's create a proxy for it
            var proxy = new Object();
            var console = writer;
            levels.forEach(function (level) {
                proxy[level] = function (obj, format) {
                    var params = [];
                    for (var _i = 2; _i < arguments.length; _i++) {
                        params[_i - 2] = arguments[_i];
                    }
                    // force actual console "log levels"
                    switch (level) {
                        case "trace":
                        case "debug":
                            level = "log";
                            break;
                        case "fatal":
                            level = "error";
                            break;
                    }
                    var array;
                    if (typeof obj === "string") {
                        array = arguments;
                    }
                    else {
                        array = params;
                        array.unshift(format);
                        array.push(obj);
                    }
                    console[level].apply(console, array);
                };
            });
            proxy["level"] = function () { return "debug"; };
            return proxy;
        }
        throw new TypeError("Unsupported log writer");
    }
    var Task = (function (_super) {
        __extends(Task, _super);
        function Task() {
            _super.call(this);
        }
        Task.prototype.on = function (event, listener) {
            return _super.prototype.on.call(this, event, listener);
        };
        return Task;
    })(EventEmitter);
    function wrapCallback(owner, task, callback) {
        return finish;
        function finish(err) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            var error = arguments[0];
            try {
                if (typeof callback === 'function') {
                    callback.apply(owner, arguments);
                    error = null;
                }
                else if (task) {
                    if (!error) {
                        switch (arguments.length) {
                            case 0:
                            case 1:
                                task.emit("success");
                                task.emit("finish", error);
                                break;
                            case 2:
                                task.emit("success", arguments[1]);
                                task.emit("finish", error, arguments[1]);
                                break;
                            case 3:
                                task.emit("success", arguments[1], arguments[2]);
                                task.emit("finish", error, arguments[1], arguments[2]);
                                break;
                            default:
                                arguments[0] = "success";
                                task.emit.apply(task, arguments);
                                if (EventEmitter.listenerCount(task, "finish") > 0) {
                                    arguments[0] = "finish";
                                    Array.prototype.splice.call(arguments, 1, 0, error);
                                    task.emit.apply(task, arguments);
                                }
                                break;
                        }
                    }
                    else {
                        if (EventEmitter.listenerCount(task, "error")) {
                            task.emit("error", error);
                            error = null;
                        }
                        task.emit("finish", error);
                    }
                }
            }
            catch (err) {
                if (error)
                    owner.emit("error", error);
                error = err;
            }
            if (error)
                owner.emit("error", error);
        }
    }
    var Encoding = (function () {
        function Encoding(name) {
            var encoding = (name + "").toLowerCase().replace("-", "");
            if (encoding != "utf8")
                throw new Error("Encoding not supported: " + name);
            //TODO: support ASCII and other encodings in addition to UTF-8
        }
        Encoding.prototype.getEncoder = function (value) {
            return new StringEncoder(value);
        };
        Encoding.prototype.getDecoder = function () {
            return new StringDecoder();
        };
        Encoding.prototype.encode = function (value, buffer, offset, end) {
            return encodeUTF8(value, buffer, offset, end);
        };
        Encoding.prototype.decode = function (buffer, offset, end) {
            return decodeUTF8(buffer, offset, end);
        };
        Encoding.UTF8 = new Encoding("utf8");
        return Encoding;
    })();
    var StringEncoder = (function () {
        function StringEncoder(value) {
            if (typeof value !== "string")
                value = "" + value;
            this._value = value;
        }
        //TODO: add write():bool, change finish() to end():void, then expect read()
        StringEncoder.prototype.finished = function () {
            return this._done;
        };
        StringEncoder.prototype.read = function (buffer, offset, end) {
            return encodeUTF8(this._value, buffer, offset, end, this);
        };
        return StringEncoder;
    })();
    function encodeUTF8(value, buffer, offset, end, state) {
        end = end || buffer.length;
        var code;
        var length;
        var position;
        if (state) {
            code = state._code | 0;
            length = state._length | 0;
            position = state._position | 0;
        }
        else {
            code = 0;
            length = 0;
            position = 0;
        }
        var done = false;
        var start = offset;
        while (true) {
            if (length > 0) {
                if (offset >= end)
                    break;
                // emit multi-byte sequences
                buffer[offset++] = (code >> 12) | 0x80;
                if (length > 1) {
                    code = (code & 0xFFF) << 6;
                    length--;
                    continue;
                }
                // proceed to next character
                length = 0;
                code = 0;
            }
            // fetch next string if needed
            if (position >= value.length) {
                position = 0;
                // if the string ends normally, we are done
                if (code == 0) {
                    done = true;
                    break;
                }
                // if the string ends with a lone high surrogate, emit a replacement character instead
                value = String.fromCharCode(65533 /* REPLACEMENT_CHAR */);
                code = 0;
            }
            if (offset >= end)
                break;
            var c = value.charCodeAt(position++);
            if (code == 0) {
                code = c;
                // handle high surrogate
                if (c >= 0xD800 && c < 0xDC00) {
                    code = 0x10000 + ((code & 0x3FF) << 10);
                    continue;
                }
                // handle lone low surrogate
                if (c >= 0xDC00 && c < 0xE000) {
                    code = 65533 /* REPLACEMENT_CHAR */;
                }
                else {
                    code = c;
                }
            }
            else {
                // handle low surrogate
                if (c >= 0xDC00 && c < 0xE000) {
                    // calculate code
                    code += (c & 0x3FF);
                }
                else {
                    // invalid low surrogate
                    code = 65533 /* REPLACEMENT_CHAR */;
                }
            }
            // emit first byte in a sequence and determine what to emit next
            if (code <= 0x7F) {
                buffer[offset++] = code;
                code = 0;
            }
            else if (code <= 0x7FF) {
                length = 1;
                buffer[offset++] = (code >> 6) | 0xC0;
                code = (code & 0x3F) << 12;
            }
            else if (code <= 0xFFFF) {
                length = 2;
                buffer[offset++] = (code >> 12) | 0xE0;
                code = (code & 0xFFF) << 6;
            }
            else if (code <= 0x10FFFF) {
                length = 3;
                buffer[offset++] = (code >> 18) | 0xF0;
                code = (code & 0x1FFFFF);
            }
            else {
                code = 65533 /* REPLACEMENT_CHAR */;
                length = 2;
                buffer[offset++] = (code >> 12) | 0xE0;
                code = (code & 0xFFF) << 6;
            }
        }
        if (state) {
            state._code = code;
            state._length = length;
            state._position = position;
            state._done = done;
        }
        else {
            if (!done)
                return -1;
        }
        return offset - start;
    }
    var StringDecoder = (function () {
        function StringDecoder() {
        }
        StringDecoder.prototype.text = function () {
            return this._text;
        };
        StringDecoder.prototype.write = function (buffer, offset, end) {
            var bytes = decodeUTF8(buffer, offset, end, this);
            var text = this._text;
            if (this._removeBom && text.length > 0) {
                if (text.charCodeAt(0) == 65279 /* BOM */)
                    this._text = text.substr(1);
                this._removeBom = false;
            }
        };
        return StringDecoder;
    })();
    function decodeUTF8(buffer, offset, end, state) {
        end = end || buffer.length;
        var text;
        var code;
        var length;
        if (state) {
            text = state._text || "";
            code = state._code | 0;
            length = state._length | 0;
        }
        else {
            text = "";
            code = 0;
            length = 0;
        }
        while (offset < end) {
            var b = buffer[offset++];
            if (length > 0) {
                if ((b & 0xC0) != 0x80) {
                    code = 65533 /* REPLACEMENT_CHAR */;
                    length = 0;
                }
                else {
                    code = (code << 6) | (b & 0x3F);
                    length--;
                    if (length > 0)
                        continue;
                }
            }
            else if (b <= 128) {
                code = b;
                length = 0;
            }
            else {
                switch (b & 0xE0) {
                    case 0xE0:
                        if (b & 0x10) {
                            code = b & 0x07;
                            length = 3;
                        }
                        else {
                            code = b & 0xF;
                            length = 2;
                        }
                        continue;
                    case 0xC0:
                        code = b & 0x1F;
                        length = 1;
                        continue;
                    default:
                        code = 65533 /* REPLACEMENT_CHAR */;
                        length = 0;
                        break;
                }
            }
            // emit surrogate pairs for supplementary plane characters
            if (code >= 0x10000) {
                code -= 0x10000;
                if (code > 0xFFFFF) {
                    code = 65533 /* REPLACEMENT_CHAR */;
                }
                else {
                    text += String.fromCharCode(0xD800 + ((code >> 10) & 0x3FF));
                    code = 0xDC00 + (code & 0x3FF);
                }
            }
            text += String.fromCharCode(code);
        }
        if (state) {
            state._code = code;
            state._length = length;
            state._text = text;
            return null;
        }
        else {
            if (length > 0)
                text += String.fromCharCode(65533 /* REPLACEMENT_CHAR */);
            return text;
        }
    }
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
                    target.write(new Uint8Array(0));
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
    function search(fs, path, emitter, options, callback) {
        if (path.length == 0)
            throw new Error("Empty path");
        // use dummy emitter if not specified
        if (!emitter)
            emitter = {
                emit: function (event) { return false; }
            };
        // prepare options
        options = options || {};
        var matchFiles = !(options.onlydir || false);
        var matchDirectories = !(options.nodir || false);
        var ignoreGlobstars = options.noglobstar || false;
        var maxDepth = options.depth | 0;
        var matchDotDirs = options.dotdirs || false;
        var expectDir = options.listonly || false;
        var expandDir = !(options.noexpand || false);
        // sanity checks
        if (!matchFiles && !matchDirectories)
            throw new Error("Not matching anything with the specified options");
        // on windows, normalize backslashes
        var windows = fs.isWindows == true;
        path = new Path(path, null).normalize().path;
        // append a wildcard to slash-ended paths, or make sure they refer to a directory
        if (path[path.length - 1] == '/') {
            if (expandDir) {
                path += "*";
            }
            else {
                path = path.substr(0, path.length - 1);
                expectDir = true;
            }
        }
        // resulting item list
        var results = [];
        // important variables
        var basePath;
        var glob;
        var queue = [];
        var patterns = [];
        // search for the first wildcard
        var w1 = path.indexOf('*');
        var w2 = path.indexOf('?');
        var w = (w1 < 0) ? w2 : (w2 < 0) ? w1 : w2;
        if (w >= 0) {
            // wildcard present -> split the path into base path and mask
            if (options.nowildcard || options.itemonly)
                throw new Error("Wildcards not allowed");
            if (options.listonly) {
                var s = path.indexOf('/', w);
                if (s > w)
                    throw new Error("Wildcards only allowed in the last path segment");
            }
            w = path.lastIndexOf('/', w);
            var mask = path.substr(w + 1);
            if (w >= 0) {
                path = path.substr(0, w);
            }
            else {
                path = ".";
            }
            // start matching
            start(path, mask);
        }
        else {
            // no wildcards -> determine whether this is a file or directory
            fs.stat(path, function (err, stats) {
                if (err)
                    return callback(err, null);
                try {
                    if (!options.itemonly) {
                        if (FileUtil.isDirectory(stats)) {
                            // if it's a directory, start matching
                            if (expandDir)
                                return start(path, "*");
                        }
                        else {
                            if (expectDir)
                                return callback(new Error("The specified path is not a directory"), null);
                            if (!FileUtil.isFile(stats)) {
                                // if it's not a file, we are done
                                return callback(null, results);
                            }
                        }
                    }
                    // determine item name
                    w = path.lastIndexOf('/');
                    var name;
                    if (w < 0) {
                        name = path;
                        path = "./" + name;
                    }
                    else {
                        name = path.substr(w + 1);
                    }
                    // push item to the results
                    var item = { filename: name, stats: stats, path: path, relativePath: name };
                    results.push(item);
                    emitter.emit("item", item);
                    return callback(null, results);
                }
                catch (err) {
                    return callback(err, null);
                }
            });
        }
        return;
        // prepare and start the matching
        function start(path, mask) {
            // construct base path
            if (path.length == 0 || (windows && path.length == 2 && path[1] == ':'))
                path += "/";
            basePath = new Path(path, fs).normalize();
            mask = "/" + mask;
            var globmask = null;
            if (!ignoreGlobstars) {
                // determine glob mask (if any)
                var gs = mask.indexOf("/**");
                if (gs >= 0) {
                    if (gs == (mask.length - 3)) {
                        globmask = "*";
                        mask = mask.substr(0, gs);
                    }
                    else if (mask[gs + 3] == '/') {
                        globmask = mask.substr(gs + 4);
                        mask = mask.substr(0, gs);
                    }
                }
            }
            var masks = mask.split('/');
            for (var i = 1; i < masks.length; i++) {
                var mask = masks[i];
                var regex = toRegExp(mask, false);
                patterns.push(regex);
            }
            if (globmask != null) {
                patterns.push(null);
                glob = toRegExp(globmask, true);
            }
            // add path to queue and process it
            queue.push({ path: new Path("", null), pattern: 0, depth: 0 });
            next();
        }
        // process next directory in the queue
        function next() {
            // get next directory to traverse
            var current = queue.shift();
            // if no more to process, we are done
            if (!current) {
                // sort the results if requested
                if (!options.nosort) {
                    results.sort(function (a, b) {
                        if (a.relativePath < b.relativePath)
                            return -1;
                        if (a.relativePath > b.relativePath)
                            return 1;
                        return 0;
                    });
                }
                return callback(null, results);
            }
            var relativePath;
            var index;
            var regex;
            var depth;
            var nextIndex;
            var matchItems;
            var enterDirs;
            try {
                // prepare vars
                relativePath = current.path;
                index = current.pattern;
                depth = current.depth;
                regex = patterns[index];
                if (regex) {
                    //console.log("Matching (r): ", basePath, path, regex.source);
                    nextIndex = index + 1;
                    var isLast = (nextIndex == patterns.length);
                    matchItems = isLast && glob == null;
                    enterDirs = !isLast;
                }
                else {
                    // globmask matching
                    //console.log("Matching (g): ", basePath, path, glob.source);
                    nextIndex = index;
                    matchItems = true;
                    enterDirs = (maxDepth == 0) || (maxDepth > 0 && depth < maxDepth);
                    // increment depth for each globmask
                    depth++;
                }
                // prepare full path
                var fullPath = basePath.join(relativePath).normalize().path;
                // list directory and process its items
                fs.opendir(fullPath, function (err, handle) {
                    if (err)
                        return callback(err, null);
                    emitter.emit("traversing", fullPath);
                    // send 1 read request
                    var error = null;
                    var requests = 1;
                    fs.readdir(handle, read);
                    function read(err, items) {
                        try {
                            requests--;
                            error = error || err;
                            if (error || !items) {
                                if (requests > 0)
                                    return;
                                // when done, close the handle
                                fs.close(handle, function (err) {
                                    error = error || err;
                                    if (err)
                                        return callback(error, null);
                                    emitter.emit("traversed", fullPath);
                                    // process next directory
                                    next();
                                });
                                return;
                            }
                            // process items
                            items.forEach(process);
                            // read next items using several parallel readdir requests
                            while (requests < 2) {
                                fs.readdir(handle, read);
                                requests++;
                            }
                        }
                        catch (err) {
                            error = error || err;
                            return callback(error, null);
                        }
                    }
                });
            }
            catch (err) {
                return callback(err, null);
            }
            // process a single item
            function process(item) {
                var isDir = FileUtil.isDirectory(item.stats);
                var isFile = FileUtil.isFile(item.stats);
                var isDotDir = (item.filename == "." || item.filename == "..");
                if (isDotDir && !matchDotDirs)
                    return;
                if (!isDir && !isFile)
                    return;
                var itemPath = relativePath.join(item.filename);
                // add subdirectory to queue if desired
                if (enterDirs && isDir && !isDotDir) {
                    queue.push({ path: itemPath, pattern: nextIndex, depth: depth });
                }
                // if not matching items in this directory, we are done with it
                if (!matchItems)
                    return;
                // reject items we don't want
                if (isDir && !matchDirectories)
                    return;
                if (isFile && !matchFiles)
                    return;
                if (regex) {
                    // mask matching
                    if (!regex.test(item.filename))
                        return;
                }
                else {
                    // globstar matching
                    if (!glob.test(itemPath.path))
                        return;
                }
                // add matched file to the list
                var relative = new Path(itemPath.path, fs).normalize();
                item.path = basePath.join(relative).path;
                item.relativePath = relative.path;
                results.push(item);
                emitter.emit("item", item);
            }
        }
        // convert mask pattern to regular expression
        function toRegExp(mask, globstar) {
            var pattern = "^";
            if (globstar)
                pattern += ".*";
            for (var i = 0; i < mask.length; i++) {
                var c = mask[i];
                switch (c) {
                    case '/':
                        var gm = mask.substr(i, 4);
                        if (gm == "/**/" || gm == "/**") {
                            pattern += ".*";
                            i += 3;
                        }
                        else {
                            pattern += '/';
                        }
                        break;
                    case '*':
                        if (globstar) {
                            pattern += "[^/]*";
                        }
                        else {
                            pattern += ".*";
                        }
                        break;
                    case '?':
                        pattern += ".";
                        break;
                    default:
                        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
                            pattern += c;
                        }
                        else {
                            pattern += "\\" + c;
                        }
                        break;
                }
            }
            pattern += "$";
            // case insensitive on Windows
            var flags = windows ? "i" : "";
            return new RegExp(pattern, flags);
        }
    }
    var FileDataSource = (function (_super) {
        __extends(FileDataSource, _super);
        function FileDataSource(fs, path, relativePath, stats, position) {
            _super.call(this);
            this.fs = fs;
            this.path = "" + path;
            this.name = new Path(path, fs).getName();
            if (relativePath !== null && typeof relativePath !== "undefined")
                this.relativePath = "" + relativePath;
            if (stats) {
                this.length = stats.size;
                this.stats = stats;
            }
            else {
                this.length = null;
                this.stats = null;
            }
            this.handle = null;
            this.nextChunkPosition = this.expectedPosition = position || 0;
            this.queue = [];
            this.started = false;
            this.eof = false;
            this.closed = false;
            this.ended = false;
            this.requests = 0;
            this.readable = false;
            this.failed = false;
        }
        FileDataSource.prototype.on = function (event, listener) {
            this._flush();
            return _super.prototype.on.call(this, event, listener);
        };
        FileDataSource.prototype._flush = function () {
            var _this = this;
            try {
                if (this.closed || this.eof) {
                    // if there are still outstanding requests, do nothing yet
                    if (this.requests > 0)
                        return;
                    // if the file is still open, close it
                    if (this.handle != null)
                        return this._close();
                    // wait for all readable blocks to be read
                    if (this.readable)
                        return;
                    // end when there is nothing else to wait for
                    if (!this.ended) {
                        this.ended = true;
                        if (!this.failed)
                            process.nextTick(function () { return _super.prototype.emit.call(_this, 'end'); });
                    }
                    return;
                }
                // open the file if not open yet
                if (!this.started)
                    return this._open();
                // return if not open
                if (this.handle == null)
                    return;
                // read more data if possible
                while (this.requests < 4) {
                    if (this.closed)
                        break;
                    if ((this.nextChunkPosition - this.expectedPosition) > 0x20000)
                        break;
                    var chunkSize = 0x8000;
                    this._next(this.nextChunkPosition, chunkSize);
                    this.nextChunkPosition += chunkSize;
                }
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataSource.prototype._next = function (position, bytesToRead) {
            var _this = this;
            //console.log("read", position, bytesToRead);
            this.requests++;
            try {
                this.fs.read(this.handle, new Uint8Array(bytesToRead), 0, bytesToRead, position, function (err, bytesRead, buffer) {
                    _this.requests--;
                    //console.log("read result", err || position, bytesRead);
                    if (err)
                        return _this._error(err);
                    if (_this.closed) {
                        _this._flush();
                        return;
                    }
                    if (bytesRead == 0) {
                        _this.eof = true;
                        _this._flush();
                        return;
                    }
                    try {
                        // prepare the chunk for the queue
                        var chunk = buffer.subarray(0, bytesRead);
                        chunk.position = position;
                        // insert the chunk into the appropriate position in the queue
                        var index = _this.queue.length;
                        while (--index >= 0) {
                            if (position > _this.queue[index].position)
                                break;
                        }
                        _this.queue.splice(++index, 0, chunk);
                        // if incomplete chunk was received, read the rest of its data
                        if (bytesRead > 0 && bytesRead < bytesToRead)
                            _this._next(position + bytesRead, bytesToRead - bytesRead);
                        _this._flush();
                        if (!_this.readable && index == 0 && chunk.position == _this.expectedPosition) {
                            _this.readable = true;
                            if (chunk.length > 0)
                                _super.prototype.emit.call(_this, 'readable');
                        }
                    }
                    catch (err) {
                        _this._error(err);
                    }
                });
            }
            catch (err) {
                this.requests--;
                this._error(err);
            }
        };
        FileDataSource.prototype.read = function () {
            var chunk = this.queue[0];
            if (chunk && chunk.position == this.expectedPosition) {
                this.expectedPosition += chunk.length;
                this.queue.shift();
                if (this.queue.length == 0 || this.queue[0].position != this.expectedPosition)
                    this.readable = false;
            }
            else {
                chunk = null;
            }
            this._flush();
            return chunk;
        };
        FileDataSource.prototype._error = function (err) {
            var _this = this;
            this.closed = true;
            this.failed = true;
            this.queue = [];
            this._flush();
            process.nextTick(function () { return _super.prototype.emit.call(_this, 'error', err); });
        };
        FileDataSource.prototype._open = function () {
            var _this = this;
            if (this.started)
                return;
            this.started = true;
            try {
                this.fs.open(this.path, "r", function (err, handle) {
                    if (err)
                        return _this._error(err);
                    if (_this.stats) {
                        _this.handle = handle;
                        _this._flush();
                        return;
                    }
                    // determine stats if not available yet
                    try {
                        _this.fs.fstat(handle, function (err, stats) {
                            if (err)
                                return _this._error(err);
                            _this.handle = handle;
                            _this.stats = stats;
                            _this.length = stats.size;
                            _this._flush();
                            return;
                        });
                    }
                    catch (err) {
                        _this._error(err);
                    }
                });
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataSource.prototype._close = function () {
            var _this = this;
            if (!this.handle)
                return;
            var handle = this.handle;
            this.handle = null;
            try {
                this.fs.close(handle, function (err) {
                    if (err)
                        return _this._error(err);
                    _this._flush();
                });
                return;
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataSource.prototype.close = function () {
            this.closed = true;
            this.queue = [];
            this._flush();
        };
        return FileDataSource;
    })(EventEmitter);
    var BlobDataSource = (function (_super) {
        __extends(BlobDataSource, _super);
        function BlobDataSource(blob, position) {
            var _this = this;
            _super.call(this);
            this.name = blob.name;
            this.length = blob.size;
            this.blob = blob;
            this.pos = position;
            this.reader = new FileReader();
            this.busy = false;
            this.readable = false;
            this.finished = false;
            this.ended = false;
            this.queue = [];
            this.reader.onload = function (e) {
                _this.busy = false;
                if (!_this.finished) {
                    var chunk = new Uint8Array(e.target.result);
                    if (chunk.length > 0) {
                        _this.queue.push(chunk);
                        if (!_this.readable) {
                            _this.readable = true;
                            _super.prototype.emit.call(_this, 'readable');
                        }
                    }
                    else {
                        _this.finished = true;
                    }
                }
                _this.flush();
            };
        }
        BlobDataSource.prototype.on = function (event, listener) {
            this.flush();
            return _super.prototype.on.call(this, event, listener);
        };
        BlobDataSource.prototype.flush = function () {
            var _this = this;
            try {
                if (this.finished) {
                    if (!this.ended) {
                        this.ended = true;
                        process.nextTick(function () { return _super.prototype.emit.call(_this, 'end'); });
                    }
                    return;
                }
                if (!this.busy && this.queue.length < 4) {
                    var slice = this.blob.slice(this.pos, this.pos + 0x8000);
                    this.pos += slice.size;
                    this.busy = true;
                    this.reader.readAsArrayBuffer(slice);
                }
            }
            catch (err) {
                this.finished = true;
                this.ended = true;
                this.queue = [];
                process.nextTick(function () { return _super.prototype.emit.call(_this, 'error', err); });
            }
        };
        BlobDataSource.prototype.read = function () {
            var chunk = this.queue.shift();
            if (!chunk) {
                chunk = null;
                this.readable = false;
            }
            this.flush();
            return chunk;
        };
        BlobDataSource.prototype.close = function () {
            this.finished = true;
            this.flush();
        };
        return BlobDataSource;
    })(EventEmitter);
    function toDataSource(fs, input, emitter, callback) {
        try {
            toAnyDataSource(input, callback);
        }
        catch (err) {
            process.nextTick(function () { return callback(err); });
        }
        function toAnyDataSource(input, callback) {
            // arrays
            if (isArray(input))
                return toArrayDataSource(input);
            // string paths
            if (isString(input))
                return toPatternDataSource(input);
            // Blob objects
            if (isFileBlob(input))
                return openBlobDataSource(input);
            throw new Error("Unsupported source");
        }
        function openBlobDataSource(blob) {
            process.nextTick(function () {
                var source = new BlobDataSource(blob, 0);
                callback(null, [source]);
            });
        }
        function isFileBlob(input) {
            return (typeof input === "object" && typeof input.size === "number" && typeof input.name === "string" && typeof input.slice == "function");
        }
        function isString(input) {
            return typeof input === "string";
        }
        function isArray(input) {
            if (Array.isArray(input))
                return true;
            if (typeof input !== "object" || typeof input.length !== "number")
                return false;
            if (input.length == 0)
                return true;
            return isString(input) || isFileBlob(input[0]);
        }
        function toArrayDataSource(input) {
            var source = [];
            var array = [];
            Array.prototype.push.apply(array, input);
            next();
            function next() {
                try {
                    var item = array.shift();
                    if (!item)
                        return callback(null, source);
                    if (isArray(item))
                        throw new Error("Unsupported array of arrays data source");
                    if (isString(item))
                        toItemDataSource(item, add);
                    else
                        toAnyDataSource(item, add);
                }
                catch (err) {
                    process.nextTick(function () { return callback(err); });
                }
            }
            function add(err, src) {
                if (err)
                    return callback(err, null);
                Array.prototype.push.apply(source, src);
                next();
            }
        }
        function toItemDataSource(path, callback) {
            if (!fs)
                throw new Error("Source file system not available");
            fs.stat(path, function (err, stats) {
                if (err)
                    return callback(err, null);
                var item = new FileDataSource(fs, path, null, stats, 0);
                callback(null, [item]);
            });
        }
        function toPatternDataSource(path) {
            if (!fs)
                throw new Error("Source file system not available");
            search(fs, path, emitter, { noexpand: true }, function (err, items) {
                if (err)
                    return callback(err, null);
                var source = [];
                items.forEach(function (it) {
                    var item = new FileDataSource(fs, it.path, it.relativePath, it.stats, 0);
                    source.push(item);
                });
                callback(null, source);
            });
        }
    }
    var FileDataTarget = (function (_super) {
        __extends(FileDataTarget, _super);
        function FileDataTarget(fs, path) {
            _super.call(this);
            this.fs = fs;
            this.path = "" + path;
            this.name = new Path(this.path, fs).getName();
            this.handle = null;
            this.position = 0;
            this.queue = [];
            this.requests = 0;
            this.started = false;
            this.ready = false;
            this.ended = false;
            this.finished = false;
            FileDataTarget.prototype.acceptsEmptyBlocks = true;
        }
        FileDataTarget.prototype.on = function (event, listener) {
            return _super.prototype.on.call(this, event, listener);
        };
        FileDataTarget.prototype._flush = function (sync) {
            var _this = this;
            if (this.ended) {
                // if there are no outstanding requests or queued data, do the cleanup
                if (this.requests == 0 && this.queue.length == 0) {
                    // if the file is still open, close it
                    if (this.handle != null)
                        return this._close();
                    // finish when there is nothing else to wait for
                    if (!this.finished) {
                        this.finished = true;
                        if (sync)
                            process.nextTick(function () { return _super.prototype.emit.call(_this, 'finish'); });
                        else
                            _super.prototype.emit.call(this, 'finish');
                    }
                    return;
                }
            }
            // return if not open
            if (!this.handle)
                return;
            try {
                // with maximum of active write requests, we are not ready to send more
                if (this.requests >= 4) {
                    this.ready = false;
                    return;
                }
                // otherwise, write more chunks while possible
                while (this.requests < 4) {
                    var chunk = this.queue.shift();
                    if (!chunk)
                        break;
                    this._next(chunk, this.position);
                    this.position += chunk.length;
                }
                // emit event when ready do accept more data
                if (!this.ready && !this.ended) {
                    this.ready = true;
                    // don't emit if called synchronously
                    if (!sync)
                        _super.prototype.emit.call(this, 'drain');
                }
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataTarget.prototype._next = function (chunk, position) {
            var _this = this;
            var bytesToWrite = chunk.length;
            //console.log("write", position, bytesToWrite);
            this.requests++;
            try {
                this.fs.write(this.handle, chunk, 0, bytesToWrite, position, function (err) {
                    _this.requests--;
                    //console.log("write done", err || position);
                    if (err)
                        return _this._error(err);
                    if (typeof chunk.callback === "function")
                        chunk.callback();
                    _this._flush(false);
                });
            }
            catch (err) {
                this.requests--;
                this._error(err);
            }
        };
        FileDataTarget.prototype._error = function (err) {
            var _this = this;
            this.ready = false;
            this.ended = true;
            this.finished = true;
            this.queue = [];
            this._flush(false);
            process.nextTick(function () { return _super.prototype.emit.call(_this, 'error', err); });
        };
        FileDataTarget.prototype.write = function (chunk, callback) {
            // don't accept more data if ended
            if (this.ended)
                return false;
            // enqueue the chunk for processing
            if (chunk.length > 0) {
                chunk.callback = callback;
                this.queue.push(chunk);
            }
            // open the file if not started yet
            if (!this.started) {
                this._open();
                return false;
            }
            this._flush(true);
            return this.ready;
        };
        FileDataTarget.prototype._open = function () {
            var _this = this;
            if (this.started)
                return;
            this.started = true;
            try {
                this.fs.open(this.path, "w", function (err, handle) {
                    if (err)
                        return _this._error(err);
                    _this.handle = handle;
                    _this._flush(false);
                });
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataTarget.prototype._close = function () {
            var _this = this;
            if (!this.handle)
                return;
            var handle = this.handle;
            this.handle = null;
            try {
                this.fs.close(handle, function (err) {
                    if (err)
                        return _this._error(err);
                    _this._flush(false);
                });
            }
            catch (err) {
                this._error(err);
            }
        };
        FileDataTarget.prototype.end = function () {
            this.ready = false;
            this.ended = true;
            this._flush(true);
        };
        return FileDataTarget;
    })(EventEmitter);
    var DataTarget = (function (_super) {
        __extends(DataTarget, _super);
        function DataTarget() {
            _super.call(this);
        }
        DataTarget.prototype.on = function (event, listener) {
            return _super.prototype.on.call(this, event, listener);
        };
        DataTarget.prototype._data = function (chunk) {
            _super.prototype.emit.call(this, 'data', chunk);
        };
        DataTarget.prototype._end = function () {
            _super.prototype.emit.call(this, 'end');
        };
        DataTarget.prototype.write = function (chunk, callback) {
            // we don't have to do this in the next tick because our caller doesn't need that either
            this._data(chunk);
            if (typeof callback === "function")
                callback();
            return true;
        };
        DataTarget.prototype.end = function () {
            // we don't have to do this in the next tick because our caller doesn't need that either
            this._end();
            _super.prototype.emit.call(this, 'finish');
        };
        return DataTarget;
    })(EventEmitter);
    var StringDataTarget = (function (_super) {
        __extends(StringDataTarget, _super);
        function StringDataTarget(encoding) {
            _super.call(this);
            this._decoder = new Encoding(encoding).getDecoder();
        }
        StringDataTarget.prototype._data = function (chunk) {
            this._decoder.write(chunk, 0, chunk.length);
        };
        StringDataTarget.prototype._end = function () {
        };
        StringDataTarget.prototype.result = function () {
            return this._decoder.text();
        };
        return StringDataTarget;
    })(DataTarget);
    var BlobDataTarget = (function (_super) {
        __extends(BlobDataTarget, _super);
        function BlobDataTarget(mimeType) {
            _super.call(this);
            this._chunks = [];
            this._mimeType = mimeType;
        }
        BlobDataTarget.prototype._data = function (chunk) {
            this._chunks.push(chunk);
        };
        BlobDataTarget.prototype._end = function () {
            var options;
            if (this._mimeType)
                options = { type: this._mimeType };
            this._blob = new Blob(this._chunks, options);
            this._chunks.length = 0;
        };
        BlobDataTarget.prototype.result = function () {
            return this._blob;
        };
        return BlobDataTarget;
    })(DataTarget);
    var BufferDataTarget = (function (_super) {
        __extends(BufferDataTarget, _super);
        function BufferDataTarget() {
            _super.call(this);
            this._chunks = [];
            this._length = 0;
        }
        BufferDataTarget.prototype._data = function (chunk) {
            this._length += chunk.length;
            this._chunks.push(chunk);
        };
        BufferDataTarget.prototype._end = function () {
            this._buffer = new Uint8Array(this._length);
            var offset = 0;
            for (var n = 0; n < this._chunks.length; n++) {
                var chunk = this._chunks[n];
                this._buffer.set(chunk, offset);
                offset += chunk.length;
            }
            this._chunks.length = 0;
        };
        BufferDataTarget.prototype.result = function () {
            return this._buffer;
        };
        return BufferDataTarget;
    })(DataTarget);
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
                    target = new BlobDataTarget(options.mimeType);
                    break;
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
    var WebSocketChannel = (function () {
        function WebSocketChannel(ws) {
            var _this = this;
            this.ws = ws;
            // removed
            this.failed = false;
            this.wasConnected = (ws.readyState == WebSocket.OPEN);
            this.ws.onclose = function (e) {
                var reason = e.code;
                var description = e.reason;
                _this.close(reason, description);
            };
            this.ws.onerror = function (err) {
                _this.failed = true;
                // removed
            };
            this.ws.onmessage = function (message) {
                var packet;
                if (true) {
                    packet = new Uint8Array(message.data);
                }
                else {
                    _this.reportError(new Error("Closed due to unsupported text packet"));
                    return;
                }
                if (typeof _this.onmessage === "function")
                    _this.onmessage(packet);
            };
        }
        WebSocketChannel.prototype.open = function (callback) {
            var _this = this;
            if (typeof callback !== "function")
                callback = function () { };
            var reason = 0;
            var error = null;
            switch (this.ws.readyState) {
                case WebSocket.CLOSED:
                case WebSocket.CLOSING:
                    reason = 999;
                    error = "WebSocket has been closed";
                    break;
                case WebSocket.OPEN:
                    this.wasConnected = true;
                    process.nextTick(function () { return callback(); });
                    return;
                case WebSocket.CONNECTING:
                    break;
                default:
                    reason = 999;
                    error = "WebSocket state is unknown";
                    break;
            }
            if (error != null) {
                process.nextTick(function () {
                    _this.close(reason, error);
                });
                return;
            }
            this.onopen = callback;
            this.ws.onopen = function () {
                _this.wasConnected = true;
                var onopen = _this.onopen;
                _this.onopen = null;
                if (typeof onopen === "function") {
                    onopen();
                }
            };
        };
        WebSocketChannel.prototype.on = function (event, listener) {
            switch (event) {
                case "ready":
                    this.open(listener);
                    break;
                case "message":
                    this.onmessage = listener;
                    break;
                case "close":
                    this.onclose = listener;
                    break;
                case "error":
                    this.onerror = listener;
                    break;
                default:
                    break;
            }
            return this;
        };
        WebSocketChannel.prototype.reportError = function (err) {
            if (typeof this.onerror === "function")
                this.onerror(err);
            else
                throw err;
        };
        WebSocketChannel.prototype.close = function (reason, description, code) {
            if (typeof reason !== 'number')
                reason = 1000;
            description = "" + description;
            code = code || "EFAILURE";
            if (this.ws != null) {
                try {
                    this.ws.close();
                }
                catch (err) {
                    this.reportError(err);
                }
                finally {
                    this.ws = null;
                }
            }
            var onclose = this.onclose;
            this.onopen = null;
            this.onclose = null;
            if (typeof onclose === "function") {
                var err = null;
                var message;
                switch (reason) {
                    case 999:
                        message = description;
                        break;
                    case 1000:
                        message = "Connection closed";
                        code = "ECONNRESET";
                        break;
                    case 1006:
                        message = "Connection aborted";
                        code = "ECONNABORTED";
                        break;
                    default:
                        message = "Connection failed";
                        code = "ECONNRESET";
                        break;
                }
                if (!this.wasConnected || this.failed || reason != 1000) {
                    if (!this.wasConnected) {
                        message = "Unable to connect";
                        code = "ECONNREFUSED";
                    }
                    else if (this.failed) {
                        message = "Connection failed";
                        code = "ECONNRESET";
                    }
                    err = new Error(message);
                    if (reason >= 1000)
                        err.reason = reason;
                    err.code = code;
                }
                onclose(err);
            }
        };
        WebSocketChannel.prototype.send = function (packet) {
            var _this = this;
            if (this.ws == null)
                return;
            try {
                this.ws.send(packet);
            }
            catch (err) {
                process.nextTick(function () {
                    _this.reportError(err);
                });
            }
        };
        return WebSocketChannel;
    })();
    var SftpPacket = (function () {
        function SftpPacket() {
        }
        SftpPacket.prototype.check = function (count) {
            var remaining = this.length - this.position;
            if (count > remaining)
                throw new Error("Unexpected end of packet");
        };
        SftpPacket.prototype.skip = function (count) {
            this.check(count);
            this.position += count;
        };
        SftpPacket.isBuffer = function (obj) {
            return obj && obj.buffer instanceof ArrayBuffer && typeof obj.byteLength !== "undefined";
        };
        SftpPacket.toString = function (packetType) {
            switch (packetType) {
                case 1 /* INIT */: return "INIT";
                case 2 /* VERSION */: return "VERSION";
                case 3 /* OPEN */: return "OPEN";
                case 4 /* CLOSE */: return "CLOSE";
                case 5 /* READ */: return "READ";
                case 6 /* WRITE */: return "WRITE";
                case 7 /* LSTAT */: return "LSTAT";
                case 8 /* FSTAT */: return "FSTAT";
                case 9 /* SETSTAT */: return "SETSTAT";
                case 10 /* FSETSTAT */: return "FSETSTAT";
                case 11 /* OPENDIR */: return "OPENDIR";
                case 12 /* READDIR */: return "READDIR";
                case 13 /* REMOVE */: return "REMOVE";
                case 14 /* MKDIR */: return "MKDIR";
                case 15 /* RMDIR */: return "RMDIR";
                case 16 /* REALPATH */: return "REALPATH";
                case 17 /* STAT */: return "STAT";
                case 18 /* RENAME */: return "RENAME";
                case 19 /* READLINK */: return "READLINK";
                case 20 /* SYMLINK */: return "SYMLINK";
                case 200 /* EXTENDED */: return "EXTENDED";
                case 101 /* STATUS */: return "STATUS";
                case 102 /* HANDLE */: return "HANDLE";
                case 103 /* DATA */: return "DATA";
                case 104 /* NAME */: return "NAME";
                case 105 /* ATTRS */: return "ATTRS";
                case 201 /* EXTENDED_REPLY */: return "EXTENDED_REPLY";
                default: return "" + packetType;
            }
        };
        return SftpPacket;
    })();
    var SftpPacketReader = (function (_super) {
        __extends(SftpPacketReader, _super);
        function SftpPacketReader(buffer) {
            _super.call(this);
            this.buffer = buffer;
            this.position = 0;
            this.length = buffer.length;
            var length = this.readInt32() + 4;
            if (length != this.length)
                throw new Error("Invalid packet received");
            this.type = this.readByte();
            if (this.type == 1 /* INIT */ || this.type == 2 /* VERSION */) {
                this.id = null;
            }
            else {
                this.id = this.readInt32();
                if (this.type == 200 /* EXTENDED */) {
                    this.type = this.readString();
                }
            }
        }
        SftpPacketReader.prototype.readByte = function () {
            this.check(1);
            var value = this.buffer[this.position++] & 0xFF;
            return value;
        };
        SftpPacketReader.prototype.readInt32 = function () {
            var value = this.readUint32();
            if (value & 0x80000000)
                value -= 0x100000000;
            // removed
            return value;
        };
        SftpPacketReader.prototype.readUint32 = function () {
            this.check(4);
            // removed
            var value = 0;
            value |= (this.buffer[this.position++] & 0xFF) << 24;
            value |= (this.buffer[this.position++] & 0xFF) << 16;
            value |= (this.buffer[this.position++] & 0xFF) << 8;
            value |= (this.buffer[this.position++] & 0xFF);
            return value;
        };
        SftpPacketReader.prototype.readInt64 = function () {
            var hi = this.readInt32();
            var lo = this.readUint32();
            var value = hi * 0x100000000 + lo;
            return value;
        };
        SftpPacketReader.prototype.readString = function () {
            var length = this.readInt32();
            this.check(length);
            var end = this.position + length;
            var value = decodeUTF8(this.buffer, this.position, end);
            this.position = end;
            return value;
        };
        SftpPacketReader.prototype.skipString = function () {
            var length = this.readInt32();
            this.check(length);
            var end = this.position + length;
            this.position = end;
        };
        SftpPacketReader.prototype.readData = function (clone) {
            var length = this.readInt32();
            this.check(length);
            var start = this.position;
            var end = start + length;
            this.position = end;
            var view = this.buffer.subarray(start, end);
            if (clone) {
                var buffer = new Uint8Array(length);
                buffer.set(view, 0);
                return buffer;
            }
            else {
                return view;
            }
        };
        return SftpPacketReader;
    })(SftpPacket);
    var SftpPacketWriter = (function (_super) {
        __extends(SftpPacketWriter, _super);
        function SftpPacketWriter(length) {
            _super.call(this);
            this.buffer = new Uint8Array(length);
            this.position = 0;
            this.length = length;
        }
        SftpPacketWriter.prototype.start = function () {
            this.position = 0;
            this.writeInt32(0); // length placeholder
            if (typeof this.type === "number") {
                this.writeByte(this.type);
            }
            else {
                this.writeByte(200 /* EXTENDED */);
            }
            if (this.type == 1 /* INIT */ || this.type == 2 /* VERSION */) {
            }
            else {
                this.writeInt32(this.id | 0);
                if (typeof this.type !== "number") {
                    this.writeString(this.type);
                }
            }
        };
        SftpPacketWriter.prototype.finish = function () {
            var length = this.position;
            this.position = 0;
            this.writeInt32(length - 4);
            return this.buffer.subarray(0, length);
        };
        SftpPacketWriter.prototype.writeByte = function (value) {
            this.check(1);
            this.buffer[this.position++] = value & 0xFF;
        };
        SftpPacketWriter.prototype.writeInt32 = function (value) {
            this.check(4);
            // removed
            // removed
            this.buffer[this.position++] = (value >> 24) & 0xFF;
            this.buffer[this.position++] = (value >> 16) & 0xFF;
            this.buffer[this.position++] = (value >> 8) & 0xFF;
            this.buffer[this.position++] = value & 0xFF;
        };
        SftpPacketWriter.prototype.writeInt64 = function (value) {
            var hi = (value / 0x100000000) | 0;
            var lo = (value & 0xFFFFFFFF) | 0;
            this.writeInt32(hi);
            this.writeInt32(lo);
        };
        SftpPacketWriter.prototype.writeString = function (value) {
            if (typeof value !== "string")
                value = "" + value;
            var offset = this.position;
            this.writeInt32(0); // will get overwritten later
            var bytesWritten = encodeUTF8(value, this.buffer, this.position);
            if (bytesWritten < 0)
                throw new Error("Not enough space in the buffer");
            // write number of bytes and seek back to the end
            this.position = offset;
            this.writeInt32(bytesWritten);
            this.position += bytesWritten;
        };
        SftpPacketWriter.prototype.writeData = function (data, start, end) {
            if (typeof start !== 'undefined')
                data = data.subarray(start, end);
            var length = data.length;
            this.writeInt32(length);
            this.check(length);
            this.buffer.set(data, this.position);
            this.position += length;
        };
        return SftpPacketWriter;
    })(SftpPacket);
    var SftpFlags = (function () {
        function SftpFlags() {
        }
        SftpFlags.toNumber = function (flags) {
            if (typeof flags === 'number')
                return flags & 63 /* ALL */;
            switch (flags) {
                case 'r':
                    return 1 /* READ */;
                case 'r+':
                    return 1 /* READ */ | 2 /* WRITE */;
                case 'w':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 16 /* TRUNC */;
                case 'w+':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 16 /* TRUNC */ | 1 /* READ */;
                case 'wx':
                case 'xw':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 32 /* EXCL */;
                case 'wx+':
                case 'xw+':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 32 /* EXCL */ | 1 /* READ */;
                case 'a':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */;
                case 'a+':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 1 /* READ */;
                case 'ax':
                case 'xa':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 32 /* EXCL */;
                case 'ax+':
                case 'xa+':
                    return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 32 /* EXCL */ | 1 /* READ */;
                default:
                    throw Error("Invalid flags '" + flags + "'");
            }
        };
        SftpFlags.fromNumber = function (flags) {
            flags &= 63 /* ALL */;
            // 'truncate' does not apply when creating a new file
            if ((flags & 32 /* EXCL */) != 0)
                flags &= 63 /* ALL */ ^ 16 /* TRUNC */;
            // 'append' does not apply when truncating
            if ((flags & 16 /* TRUNC */) != 0)
                flags &= 63 /* ALL */ ^ 4 /* APPEND */;
            // 'read' or 'write' must be specified (or both)
            if ((flags & (1 /* READ */ | 2 /* WRITE */)) == 0)
                flags |= 1 /* READ */;
            // when not creating a new file, only 'read' or 'write' applies
            // (and when creating a new file, 'write' is required)
            if ((flags & 8 /* CREATE */) == 0)
                flags &= 1 /* READ */ | 2 /* WRITE */;
            else
                flags |= 2 /* WRITE */;
            switch (flags) {
                case 1: return ["r"];
                case 2:
                case 3: return ["r+"];
                case 10: return ["wx", "r+"];
                case 11: return ["wx+", "r+"];
                case 14: return ["a"];
                case 15: return ["a+"];
                case 26: return ["w"];
                case 27: return ["w+"];
                case 42: return ["wx"];
                case 43: return ["wx+"];
                case 46: return ["ax"];
                case 47: return ["ax+"];
            }
            // this will never occur
            throw Error("Unsupported flags");
        };
        return SftpFlags;
    })();
    var SftpExtensions = (function () {
        function SftpExtensions() {
        }
        SftpExtensions.isKnown = function (name) {
            return SftpExtensions.hasOwnProperty("_" + name);
        };
        SftpExtensions.POSIX_RENAME = "posix-rename@openssh.com"; // "1"
        SftpExtensions.STATVFS = "statvfs@openssh.com"; // "2"
        SftpExtensions.FSTATVFS = "fstatvfs@openssh.com"; // "2"
        SftpExtensions.HARDLINK = "hardlink@openssh.com"; // "1"
        SftpExtensions.FSYNC = "fsync@openssh.com"; // "1"
        SftpExtensions.NEWLINE = "newline@sftp.ws"; // "\n"
        SftpExtensions.CHARSET = "charset@sftp.ws"; // "utf-8"
        SftpExtensions._constructor = (function () {
            for (var name in SftpExtensions) {
                if (SftpExtensions.hasOwnProperty(name)) {
                    SftpExtensions["_" + SftpExtensions[name]] = true;
                }
            }
        })();
        return SftpExtensions;
    })();
    var SftpStatus = (function () {
        function SftpStatus() {
        }
        SftpStatus.write = function (response, code, message) {
            response.type = 101 /* STATUS */;
            response.start();
            response.writeInt32(code);
            response.writeString(message);
            response.writeInt32(0);
        };
        SftpStatus.writeSuccess = function (response) {
            this.write(response, 0 /* OK */, "OK");
        };
        return SftpStatus;
    })();
    var SftpOptions = (function () {
        function SftpOptions() {
        }
        return SftpOptions;
    })();
    var SftpAttributes = (function () {
        function SftpAttributes(reader) {
            if (typeof reader === 'undefined') {
                this.flags = 0;
                return;
            }
            var flags = this.flags = reader.readUint32();
            if (flags & 1 /* SIZE */) {
                this.size = reader.readInt64();
            }
            if (flags & 2 /* UIDGID */) {
                this.uid = reader.readInt32();
                this.gid = reader.readInt32();
            }
            if (flags & 4 /* PERMISSIONS */) {
                this.mode = reader.readUint32();
            }
            if (flags & 8 /* ACMODTIME */) {
                this.atime = new Date(1000 * reader.readUint32());
                this.mtime = new Date(1000 * reader.readUint32());
            }
            if (flags & 2147483648 /* EXTENDED */) {
                this.flags &= ~2147483648 /* EXTENDED */;
                this.size = reader.readInt64();
                for (var i = 0; i < this.size; i++) {
                    reader.skipString();
                    reader.skipString();
                }
            }
        }
        SftpAttributes.prototype.isDirectory = function () {
            return (this.mode & 61440 /* ALL */) == 16384 /* DIRECTORY */;
        };
        SftpAttributes.prototype.isFile = function () {
            return (this.mode & 61440 /* ALL */) == 32768 /* REGULAR_FILE */;
        };
        SftpAttributes.prototype.isSymbolicLink = function () {
            return (this.mode & 61440 /* ALL */) == 40960 /* SYMLINK */;
        };
        SftpAttributes.prototype.write = function (response) {
            var flags = this.flags;
            response.writeInt32(flags);
            if (flags & 1 /* SIZE */) {
                response.writeInt64(this.size);
            }
            if (flags & 2 /* UIDGID */) {
                response.writeInt32(this.uid);
                response.writeInt32(this.gid);
            }
            if (flags & 4 /* PERMISSIONS */) {
                response.writeInt32(this.mode);
            }
            if (flags & 8 /* ACMODTIME */) {
                response.writeInt32(this.atime.getTime() / 1000);
                response.writeInt32(this.mtime.getTime() / 1000);
            }
            if (flags & 2147483648 /* EXTENDED */) {
                response.writeInt32(0);
            }
        };
        SftpAttributes.prototype.from = function (stats) {
            if (stats == null || typeof stats === 'undefined') {
                this.flags = 0;
            }
            else {
                var flags = 0;
                if (typeof stats.size !== 'undefined') {
                    flags |= 1 /* SIZE */;
                    this.size = stats.size | 0;
                }
                if (typeof stats.uid !== 'undefined' || typeof stats.gid !== 'undefined') {
                    flags |= 2 /* UIDGID */;
                    this.uid = stats.uid | 0;
                    this.gid = stats.gid | 0;
                }
                if (typeof stats.mode !== 'undefined') {
                    flags |= 4 /* PERMISSIONS */;
                    this.mode = stats.mode | 0;
                }
                if (typeof stats.atime !== 'undefined' || typeof stats.mtime !== 'undefined') {
                    flags |= 8 /* ACMODTIME */;
                    this.atime = stats.atime; //TODO: make sure its Date
                    this.mtime = stats.mtime; //TODO: make sure its Date
                }
                if (typeof stats.nlink !== 'undefined') {
                    this.nlink = stats.nlink;
                }
                this.flags = flags;
            }
        };
        return SftpAttributes;
    })();
    var SftpItem = (function () {
        function SftpItem() {
        }
        return SftpItem;
    })();
    var SftpHandle = (function () {
        function SftpHandle(handle, owner) {
            this._handle = handle;
            this._this = owner;
        }
        SftpHandle.prototype.toString = function () {
            var value = "0x";
            for (var i = 0; i < this._handle.length; i++) {
                var b = this._handle[i];
                var c = b.toString(16);
                if (b < 16)
                    value += "0";
                value += c;
            }
            return value;
        };
        return SftpHandle;
    })();
    var SftpClientCore = (function () {
        function SftpClientCore() {
            this._host = null;
            this._id = null;
            this._ready = false;
            this._requests = [];
            this._extensions = {};
            this._maxWriteBlockLength = 32 * 1024;
            this._maxReadBlockLength = 256 * 1024;
        }
        SftpClientCore.prototype.getRequest = function (type) {
            var request = new SftpPacketWriter(this._maxWriteBlockLength + 1024);
            request.type = type;
            request.id = this._id;
            if (type == 1 /* INIT */) {
                if (this._id != null)
                    throw new Error("Already initialized");
                this._id = 1;
            }
            else {
                this._id = (this._id + 1) & 0xFFFFFFFF;
            }
            request.start();
            return request;
        };
        SftpClientCore.prototype.writeStats = function (packet, attrs) {
            var pattrs = new SftpAttributes();
            pattrs.from(attrs);
            pattrs.write(packet);
        };
        SftpClientCore.prototype.execute = function (request, callback, responseParser, info) {
            var _this = this;
            if (typeof callback !== 'function') {
                // use dummy callback to prevent having to check this later
                callback = function (err) {
                    if (err)
                        throw err;
                };
            }
            if (!this._host) {
                process.nextTick(function () {
                    var error = _this.createError(6 /* NO_CONNECTION */, "Not connected", info);
                    callback(error);
                });
                return;
            }
            if (typeof this._requests[request.id] !== 'undefined')
                throw new Error("Duplicate request");
            var packet = request.finish();
            this._host.send(packet);
            this._requests[request.id] = { callback: callback, responseParser: responseParser, info: info };
        };
        SftpClientCore.prototype._init = function (host, callback) {
            var _this = this;
            if (this._host)
                throw new Error("Already bound");
            this._host = host;
            this._extensions = {};
            var request = this.getRequest(1 /* INIT */);
            request.writeInt32(3); // SFTPv3
            var info = { command: "init" };
            this.execute(request, callback, function (response, cb) {
                if (response.type != 2 /* VERSION */) {
                    host.close(3002);
                    var error = _this.createError(5 /* BAD_MESSAGE */, "Unexpected message", info);
                    return callback(new Error("Protocol violation"));
                }
                var version = response.readInt32();
                if (version != 3) {
                    host.close(3002);
                    var error = _this.createError(5 /* BAD_MESSAGE */, "Unexpected protocol version", info);
                    return callback(error);
                }
                while ((response.length - response.position) >= 4) {
                    var extensionName = response.readString();
                    var value;
                    if (SftpExtensions.isKnown(extensionName)) {
                        value = response.readString();
                    }
                    else {
                        value = response.readData(true);
                    }
                    var values = _this._extensions[extensionName] || [];
                    values.push(value);
                    _this._extensions[extensionName] = values;
                }
                _this._ready = true;
                callback(null);
            }, info);
        };
        SftpClientCore.prototype._process = function (packet) {
            var response = new SftpPacketReader(packet);
            var request = this._requests[response.id];
            if (typeof request === 'undefined')
                throw new Error("Unknown response ID");
            delete this._requests[response.id];
            response.info = request.info;
            request.responseParser.call(this, response, request.callback);
        };
        SftpClientCore.prototype._end = function () {
            var host = this._host;
            if (host)
                this._host = null;
            this.failRequests(7 /* CONNECTION_LOST */, "Connection lost");
        };
        SftpClientCore.prototype.end = function () {
            var host = this._host;
            if (host) {
                this._host = null;
                host.close();
            }
            this.failRequests(7 /* CONNECTION_LOST */, "Connection closed");
        };
        SftpClientCore.prototype.failRequests = function (code, message) {
            var _this = this;
            var requests = this._requests;
            this._requests = [];
            requests.forEach(function (request) {
                var error = _this.createError(code, message, request.info);
                request.callback(error);
            });
        };
        SftpClientCore.prototype.open = function (path, flags, attrs, callback) {
            path = this.checkPath(path, 'path');
            if (typeof attrs === 'function' && typeof callback === 'undefined') {
                callback = attrs;
                attrs = null;
            }
            var request = this.getRequest(3 /* OPEN */);
            request.writeString(path);
            request.writeInt32(SftpFlags.toNumber(flags));
            this.writeStats(request, attrs);
            this.execute(request, callback, this.parseHandle, { command: "open", path: path });
        };
        SftpClientCore.prototype.close = function (handle, callback) {
            var h = this.toHandle(handle);
            var request = this.getRequest(4 /* CLOSE */);
            request.writeData(h);
            this.execute(request, callback, this.parseStatus, { command: "close", handle: handle });
        };
        SftpClientCore.prototype.read = function (handle, buffer, offset, length, position, callback) {
            var _this = this;
            var h = this.toHandle(handle);
            this.checkBuffer(buffer, offset, length);
            this.checkPosition(position);
            // make sure the length is within reasonable limits
            if (length > this._maxReadBlockLength)
                length = this._maxReadBlockLength;
            var request = this.getRequest(5 /* READ */);
            request.writeData(h);
            request.writeInt64(position);
            request.writeInt32(length);
            this.execute(request, callback, function (response, cb) { return _this.parseData(response, callback, 0, h, buffer, offset, length, position); }, { command: "read", handle: handle });
        };
        SftpClientCore.prototype.write = function (handle, buffer, offset, length, position, callback) {
            var h = this.toHandle(handle);
            this.checkBuffer(buffer, offset, length);
            this.checkPosition(position);
            if (length > this._maxWriteBlockLength)
                throw new Error("Length exceeds maximum allowed data block length");
            var request = this.getRequest(6 /* WRITE */);
            request.writeData(h);
            request.writeInt64(position);
            request.writeData(buffer, offset, offset + length);
            this.execute(request, callback, this.parseStatus, { command: "write", handle: handle });
        };
        SftpClientCore.prototype.lstat = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(7 /* LSTAT */, [path], callback, this.parseAttribs, { command: "lstat", path: path });
        };
        SftpClientCore.prototype.fstat = function (handle, callback) {
            var h = this.toHandle(handle);
            var request = this.getRequest(8 /* FSTAT */);
            request.writeData(h);
            this.execute(request, callback, this.parseAttribs, { command: "fstat", handle: handle });
        };
        SftpClientCore.prototype.setstat = function (path, attrs, callback) {
            path = this.checkPath(path, 'path');
            var request = this.getRequest(9 /* SETSTAT */);
            request.writeString(path);
            this.writeStats(request, attrs);
            this.execute(request, callback, this.parseStatus, { command: "setstat", path: path });
        };
        SftpClientCore.prototype.fsetstat = function (handle, attrs, callback) {
            var h = this.toHandle(handle);
            var request = this.getRequest(10 /* FSETSTAT */);
            request.writeData(h);
            this.writeStats(request, attrs);
            this.execute(request, callback, this.parseStatus, { command: "fsetstat", handle: handle });
        };
        SftpClientCore.prototype.opendir = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(11 /* OPENDIR */, [path], callback, this.parseHandle, { command: "opendir", path: path });
        };
        SftpClientCore.prototype.readdir = function (handle, callback) {
            var h = this.toHandle(handle);
            var request = this.getRequest(12 /* READDIR */);
            request.writeData(h);
            this.execute(request, callback, this.parseItems, { command: "readdir", handle: handle });
        };
        SftpClientCore.prototype.unlink = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(13 /* REMOVE */, [path], callback, this.parseStatus, { command: "unline", path: path });
        };
        SftpClientCore.prototype.mkdir = function (path, attrs, callback) {
            path = this.checkPath(path, 'path');
            if (typeof attrs === 'function' && typeof callback === 'undefined') {
                callback = attrs;
                attrs = null;
            }
            var request = this.getRequest(14 /* MKDIR */);
            request.writeString(path);
            this.writeStats(request, attrs);
            this.execute(request, callback, this.parseStatus, { command: "mkdir", path: path });
        };
        SftpClientCore.prototype.rmdir = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(15 /* RMDIR */, [path], callback, this.parseStatus, { command: "rmdir", path: path });
        };
        SftpClientCore.prototype.realpath = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(16 /* REALPATH */, [path], callback, this.parsePath, { command: "realpath", path: path });
        };
        SftpClientCore.prototype.stat = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(17 /* STAT */, [path], callback, this.parseAttribs, { command: "stat", path: path });
        };
        SftpClientCore.prototype.rename = function (oldPath, newPath, callback) {
            oldPath = this.checkPath(oldPath, 'oldPath');
            newPath = this.checkPath(newPath, 'newPath');
            this.command(18 /* RENAME */, [oldPath, newPath], callback, this.parseStatus, { command: "rename", oldPath: oldPath, newPath: newPath });
        };
        SftpClientCore.prototype.readlink = function (path, callback) {
            path = this.checkPath(path, 'path');
            this.command(19 /* READLINK */, [path], callback, this.parsePath, { command: "readlink", path: path });
        };
        SftpClientCore.prototype.symlink = function (targetPath, linkPath, callback) {
            targetPath = this.checkPath(targetPath, 'targetPath');
            linkPath = this.checkPath(linkPath, 'linkPath');
            this.command(20 /* SYMLINK */, [targetPath, linkPath], callback, this.parseStatus, { command: "symlink", targetPath: targetPath, linkPath: linkPath });
        };
        SftpClientCore.prototype.link = function (oldPath, newPath, callback) {
            oldPath = this.checkPath(oldPath, 'oldPath');
            newPath = this.checkPath(newPath, 'newPath');
            this.command(SftpExtensions.HARDLINK, [oldPath, newPath], callback, this.parseStatus, { command: "link", oldPath: oldPath, newPath: newPath });
        };
        SftpClientCore.prototype.toHandle = function (handle) {
            if (!handle) {
                throw new Error("Missing handle");
            }
            else if (typeof handle === 'object') {
                if (SftpPacket.isBuffer(handle._handle) && handle._this == this)
                    return handle._handle;
            }
            throw new Error("Invalid handle");
        };
        SftpClientCore.prototype.checkBuffer = function (buffer, offset, length) {
            if (!SftpPacket.isBuffer(buffer))
                throw new Error("Invalid buffer");
            if (typeof offset !== 'number' || offset < 0)
                throw new Error("Invalid offset");
            if (typeof length !== 'number' || length < 0)
                throw new Error("Invalid length");
            if ((offset + length) > buffer.length)
                throw new Error("Offset or length is out of bands");
        };
        SftpClientCore.prototype.checkPath = function (path, name) {
            path = Path.check(path, name);
            if (path[0] === '~') {
                if (path[1] === '/') {
                    path = "." + path.substr(1);
                }
                else if (path.length == 1) {
                    path = ".";
                }
            }
            return path;
        };
        SftpClientCore.prototype.checkPosition = function (position) {
            if (typeof position !== 'number' || position < 0 || position > 0x7FFFFFFFFFFFFFFF)
                throw new Error("Invalid position");
        };
        SftpClientCore.prototype.command = function (command, args, callback, responseParser, info) {
            var request = this.getRequest(command);
            for (var i = 0; i < args.length; i++) {
                request.writeString(args[i]);
            }
            this.execute(request, callback, responseParser, info);
        };
        SftpClientCore.prototype.readStatus = function (response) {
            var nativeCode = response.readInt32();
            var message = response.readString();
            if (nativeCode == 0 /* OK */)
                return null;
            var info = response.info;
            return this.createError(nativeCode, message, info);
        };
        SftpClientCore.prototype.readItem = function (response) {
            var item = new SftpItem();
            item.filename = response.readString();
            item.longname = response.readString();
            item.stats = new SftpAttributes(response);
            return item;
        };
        SftpClientCore.prototype.createError = function (nativeCode, message, info) {
            var code;
            var errno;
            switch (nativeCode) {
                case 1 /* EOF */:
                    code = "EOF";
                    errno = 1;
                    break;
                case 2 /* NO_SUCH_FILE */:
                    code = "ENOENT";
                    errno = 34;
                    break;
                case 3 /* PERMISSION_DENIED */:
                    code = "EACCES";
                    errno = 3;
                    break;
                case 0 /* OK */:
                case 4 /* FAILURE */:
                case 5 /* BAD_MESSAGE */:
                    code = "EFAILURE";
                    errno = -2;
                    break;
                case 6 /* NO_CONNECTION */:
                    code = "ENOTCONN";
                    errno = 31;
                    break;
                case 7 /* CONNECTION_LOST */:
                    code = "ESHUTDOWN";
                    errno = 46;
                    break;
                case 8 /* OP_UNSUPPORTED */:
                    code = "ENOSYS";
                    errno = 35;
                    break;
                case 5 /* BAD_MESSAGE */:
                    code = "ESHUTDOWN";
                    errno = 46;
                    break;
                default:
                    code = "UNKNOWN";
                    errno = -1;
                    break;
            }
            var command = info.command;
            var arg = info.path || info.handle;
            if (typeof arg === "string")
                arg = "'" + arg + "'";
            else if (arg)
                arg = new String(arg);
            else
                arg = "";
            var error = new Error(code + ", " + command + " " + arg);
            error['errno'] = errno;
            error['code'] = code;
            for (var name in info) {
                if (name == "command")
                    continue;
                if (info.hasOwnProperty(name))
                    error[name] = info[name];
            }
            error['nativeCode'] = nativeCode;
            error['description'] = message;
            return error;
        };
        SftpClientCore.prototype.checkResponse = function (response, expectedType, callback) {
            if (response.type == 101 /* STATUS */) {
                var error = this.readStatus(response);
                if (error != null) {
                    callback(error);
                    return false;
                }
            }
            if (response.type != expectedType)
                throw new Error("Unexpected packet received");
            return true;
        };
        SftpClientCore.prototype.parseStatus = function (response, callback) {
            if (!this.checkResponse(response, 101 /* STATUS */, callback))
                return;
            callback(null);
        };
        SftpClientCore.prototype.parseAttribs = function (response, callback) {
            if (!this.checkResponse(response, 105 /* ATTRS */, callback))
                return;
            var attrs = new SftpAttributes(response);
            delete attrs.flags;
            callback(null, attrs);
        };
        SftpClientCore.prototype.parseHandle = function (response, callback) {
            if (!this.checkResponse(response, 102 /* HANDLE */, callback))
                return;
            var handle = response.readData(true);
            callback(null, new SftpHandle(handle, this));
        };
        SftpClientCore.prototype.parsePath = function (response, callback) {
            if (!this.checkResponse(response, 104 /* NAME */, callback))
                return;
            var count = response.readInt32();
            if (count != 1)
                throw new Error("Invalid response");
            var path = response.readString();
            callback(null, path);
        };
        SftpClientCore.prototype.parseData = function (response, callback, retries, h, buffer, offset, length, position) {
            var _this = this;
            if (response.type == 101 /* STATUS */) {
                var error = this.readStatus(response);
                if (error != null) {
                    if (error['nativeCode'] == 1 /* EOF */)
                        callback(null, 0, buffer);
                    else
                        callback(error, 0, null);
                    return;
                }
            }
            var data = response.readData(false);
            if (data.length > length)
                throw new Error("Received too much data");
            length = data.length;
            if (length == 0) {
                // workaround for broken servers such as Globalscape 7.1.x that occasionally send empty data
                if (retries > 4) {
                    var error = this.createError(4 /* FAILURE */, "Unable to read data", response.info);
                    error['code'] = "EIO";
                    error['errno'] = 55;
                    callback(error, 0, null);
                    return;
                }
                var request = this.getRequest(5 /* READ */);
                request.writeData(h);
                request.writeInt64(position);
                request.writeInt32(length);
                this.execute(request, callback, function (response, cb) { return _this.parseData(response, callback, retries + 1, h, buffer, offset, length, position); }, response.info);
                return;
            }
            buffer.set(data, offset);
            callback(null, length, buffer);
        };
        SftpClientCore.prototype.parseItems = function (response, callback) {
            if (response.type == 101 /* STATUS */) {
                var error = this.readStatus(response);
                if (error != null) {
                    if (error['nativeCode'] == 1 /* EOF */)
                        callback(null, false);
                    else
                        callback(error, null);
                    return;
                }
            }
            if (response.type != 104 /* NAME */)
                throw new Error("Unexpected packet received");
            var count = response.readInt32();
            var items = [];
            for (var i = 0; i < count; i++) {
                items[i] = this.readItem(response);
            }
            callback(null, items);
        };
        return SftpClientCore;
    })();
    var SftpClient = (function (_super) {
        __extends(SftpClient, _super);
        function SftpClient(local) {
            var sftp = new SftpClientCore();
            _super.call(this, sftp, local);
        }
        SftpClient.prototype.bind = function (channel, callback) {
            var _this = this;
            var sftp = this._fs;
            if (this._bound)
                throw new Error("Already bound");
            this._bound = true;
            var ready = false;
            var self = this;
            channel.on("ready", function () {
                ready = true;
                sftp._init(channel, function (error) {
                    if (error) {
                        sftp._end();
                        _this._bound = false;
                        return done(error);
                    }
                    done(null);
                    _this.emit('ready');
                });
            });
            channel.on("message", function (packet) {
                try {
                    sftp._process(packet);
                }
                catch (err) {
                    _this.emit("error", err);
                    sftp.end();
                }
            });
            channel.on("error", function (err) {
                _this.emit("error", err);
                sftp.end();
            });
            channel.on("close", function (err) {
                if (!ready) {
                    err = err || new Error("Unable to connect");
                    done(err);
                }
                else {
                    sftp._end();
                    _this._bound = false;
                    _this.emit('close', err);
                }
            });
            function done(error) {
                if (typeof callback === "function") {
                    try {
                        callback(error);
                        error = null;
                    }
                    catch (err) {
                        error = err;
                    }
                }
                if (error)
                    self.emit("error", error);
            }
        };
        SftpClient.prototype.end = function () {
            var sftp = this._fs;
            sftp.end();
        };
        return SftpClient;
    })(FilesystemPlus);
    var Client = (function (_super) {
        __extends(Client, _super);
        function Client() {
            _super.call(this, null);
        }
        Client.prototype.on = function (event, listener) {
            return _super.prototype.on.call(this, event, listener);
        };
        Client.prototype.once = function (event, listener) {
            return _super.prototype.on.call(this, event, listener);
        };
        Client.prototype.connect = function (address, options, callback) {
            options = options || {};
            if (typeof options.protocol == 'undefined') {
                options.protocol = 'sftp';
            }
            var protocols = [];
            if (typeof options !== 'object' || typeof options.protocol == 'undefined') {
                protocols.push('sftp');
            }
            else {
                protocols.push(options.protocol);
            }
            var ws = new WebSocket(address, protocols);
            ws.binaryType = "arraybuffer";
            var channel = new WebSocketChannel(ws);
            _super.prototype.bind.call(this, channel, callback);
        };
        return Client;
    })(SftpClient);
    SFTP.Client = Client;
})(SFTP || (SFTP = {}));

//# sourceMappingURL=sftp.js.map