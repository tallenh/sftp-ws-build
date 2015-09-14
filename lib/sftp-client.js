var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var packet = require("./sftp-packet");
var misc = require("./sftp-misc");
var plus = require("./fs-plus");
var fsmisc = require("./fs-misc");
var FilesystemPlus = plus.FilesystemPlus;
var SftpPacket = packet.SftpPacket;
var SftpPacketWriter = packet.SftpPacketWriter;
var SftpPacketReader = packet.SftpPacketReader;
var SftpFlags = misc.SftpFlags;
var SftpAttributes = misc.SftpAttributes;
var SftpExtensions = misc.SftpExtensions;
var Path = fsmisc.Path;
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
        data.copy(buffer, offset, 0, length); //WEB: buffer.set(data, offset);
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
exports.SftpClient = SftpClient;
