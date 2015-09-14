var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var packet = require("./sftp-packet");
var misc = require("./sftp-misc");
var fsmisc = require("./fs-misc");
var FileUtil = fsmisc.FileUtil;
var SftpPacket = packet.SftpPacket;
var SftpPacketWriter = packet.SftpPacketWriter;
var SftpPacketReader = packet.SftpPacketReader;
var SftpAttributes = misc.SftpAttributes;
var SftpStatus = misc.SftpStatus;
var SftpFlags = misc.SftpFlags;
var SftpExtensions = misc.SftpExtensions;
var SftpResponse = (function (_super) {
    __extends(SftpResponse, _super);
    function SftpResponse() {
        _super.call(this, 34000);
    }
    return SftpResponse;
})(SftpPacketWriter);
var SftpHandleInfo = (function () {
    function SftpHandleInfo(h) {
        this.h = h;
        this.items = null;
        this.locked = false;
        this.tasks = [];
    }
    return SftpHandleInfo;
})();
var SftpException = (function () {
    function SftpException(err) {
        var message;
        var code = 4 /* FAILURE */;
        var errno = err.errno | 0;
        // loosely based on the list from https://github.com/rvagg/node-errno/blob/master/errno.js
        switch (errno) {
            default:
                if (err["isPublic"] === true)
                    message = err.message;
                else
                    message = "Unknown error (" + errno + ")";
                break;
            case 1:
                message = "End of file";
                code = 1 /* EOF */;
                break;
            case 3:
                message = "Permission denied";
                code = 3 /* PERMISSION_DENIED */;
                break;
            case 4:
                message = "Try again";
                break;
            case 9:
                message = "Bad file number";
                break;
            case 10:
                message = "Device or resource busy";
                break;
            case 18:
                message = "Invalid argument";
                break;
            case 20:
                message = "Too many open files";
                break;
            case 24:
                message = "File table overflow";
                break;
            case 25:
                message = "No buffer space available";
                break;
            case 26:
                message = "Out of memory";
                break;
            case 27:
                message = "Not a directory";
                break;
            case 28:
                message = "Is a directory";
                break;
            case -2: // ENOENT on Linux with Node >=0x12 (or node-webkit - see http://stackoverflow.com/questions/23158277/why-does-the-errno-in-node-webkit-differ-from-node-js)
            case -4058: // ENOENT on Windows with Node >=0.12
            //TODO: need to look into those weird error codes (but err.code seems to consistently be set to "ENOENT"
            case 34:
                message = "No such file or directory";
                code = 2 /* NO_SUCH_FILE */;
                break;
            case 35:
                message = "Function not implemented";
                code = 8 /* OP_UNSUPPORTED */;
                break;
            case 47:
                message = "File exists";
                break;
            case 49:
                message = "File name too long";
                break;
            case 50:
                message = "Operation not permitted";
                break;
            case 51:
                message = "Too many symbolic links encountered";
                break;
            case 52:
                message = "Cross-device link";
                break;
            case 53:
                message = "Directory not empty";
                break;
            case 54:
                message = "No space left on device";
                break;
            case 55:
                message = "I/O error";
                break;
            case 56:
                message = "Read-only file system";
                break;
            case 57:
                message = "No such device";
                code = 2 /* NO_SUCH_FILE */;
                break;
            case 58:
                message = "Illegal seek";
                break;
            case 59:
                message = "Operation canceled";
                break;
        }
        this.name = "SftpException";
        this.message = message;
        this.code = code;
        this.errno = errno;
    }
    return SftpException;
})();
var SftpServerSession = (function () {
    function SftpServerSession(channel, fs, emitter, log) {
        var _this = this;
        this._id = SftpServerSession._nextSessionId++;
        this._fs = fs;
        this._channel = channel;
        this._log = log;
        this._handles = new Array(SftpServerSession.MAX_HANDLE_COUNT + 1);
        this.nextHandle = 1;
        // determine the log level now to speed up logging later
        var level = log.level();
        if (level <= 10 || level === "trace") {
            this._debug = true;
            this._trace = true;
        }
        else if (level <= 20 || level == "debug") {
            this._debug = true;
            this._trace = false;
        }
        else {
            this._trace = false;
            this._debug = false;
        }
        channel.on("message", function (packet) {
            try {
                _this._process(packet);
            }
            catch (err) {
                emitter.emit("error", err, _this);
                _this.end();
            }
        });
        channel.on("error", function (err) {
            emitter.emit("error", err, _this);
            _this.end();
        });
        channel.on("close", function (err) {
            _this._end();
            emitter.emit("closedSession", _this, err);
        });
    }
    SftpServerSession.prototype.send = function (response) {
        // send packet
        var packet = response.finish();
        if (this._debug) {
            var meta = {
                "session": this._id,
                "req": response.id,
                "type": SftpPacket.toString(response.type),
                "length": packet.length
            };
            if (this._trace)
                meta["raw"] = packet;
            this._log.debug(meta, "[%d] #%d - Sending response", this._id, response.id);
        }
        this._channel.send(packet);
        // start next task
        if (typeof response.handleInfo === 'object') {
            this.processNext(response.handleInfo);
        }
    };
    SftpServerSession.prototype.sendStatus = function (response, code, message) {
        SftpStatus.write(response, code, message);
        this.send(response);
    };
    SftpServerSession.prototype.sendError = function (response, err, isFatal) {
        var message;
        var code;
        if (!isFatal) {
            var error = new SftpException(err);
            code = error.code;
            message = error.message;
        }
        else {
            code = 4 /* FAILURE */;
            message = "Internal server error";
        }
        if (this._debug || isFatal) {
            var meta = {
                "reason": message,
                "nativeCode": code,
                "err": err
            };
            if (!isFatal) {
                this._log.debug(meta, "[%d] #%d - Request failed", this._id, response.id);
            }
            else {
                this._log.error(meta, "Unexpected error while processing request #%s", response.id);
            }
        }
        SftpStatus.write(response, code, message);
        this.send(response);
    };
    SftpServerSession.prototype.sendIfError = function (response, err) {
        if (err == null || typeof err === 'undefined')
            return false;
        this.sendError(response, err, false);
        return true;
    };
    SftpServerSession.prototype.sendSuccess = function (response, err) {
        if (this.sendIfError(response, err))
            return;
        SftpStatus.writeSuccess(response);
        this.send(response);
    };
    SftpServerSession.prototype.sendAttribs = function (response, err, stats) {
        if (this.sendIfError(response, err))
            return;
        response.type = 105 /* ATTRS */;
        response.start();
        var attr = new SftpAttributes();
        attr.from(stats);
        attr.write(response);
        this.send(response);
    };
    SftpServerSession.prototype.sendHandle = function (response, handleInfo) {
        response.type = 102 /* HANDLE */;
        response.start();
        response.writeInt32(4);
        response.writeInt32(handleInfo.h);
        this.send(response);
    };
    SftpServerSession.prototype.sendPath = function (response, err, path) {
        if (this.sendIfError(response, err))
            return;
        response.type = 104 /* NAME */;
        response.start();
        response.writeInt32(1);
        response.writeString(path);
        response.writeString("");
        response.writeInt32(0);
        this.send(response);
    };
    SftpServerSession.prototype.writeItem = function (response, item) {
        var attr = new SftpAttributes();
        attr.from(item.stats);
        var filename = item.filename;
        var longname = item.longname || FileUtil.toString(filename, attr);
        response.writeString(filename);
        response.writeString(longname);
        attr.write(response);
    };
    SftpServerSession.prototype.readHandleInfo = function (request) {
        // read a 4-byte handle
        if (request.readInt32() != 4)
            return null;
        var h = request.readInt32();
        var handleInfo = this._handles[h];
        if (typeof handleInfo !== 'object')
            return null;
        return handleInfo;
    };
    SftpServerSession.prototype.createHandleInfo = function () {
        var h = this.nextHandle;
        var max = SftpServerSession.MAX_HANDLE_COUNT;
        for (var i = 0; i < max; i++) {
            var next = (h % max) + 1; // 1..MAX_HANDLE_COUNT
            var handleInfo = this._handles[h];
            if (typeof handleInfo === 'undefined') {
                var handleInfo = new SftpHandleInfo(h);
                this._handles[h] = handleInfo;
                this.nextHandle = next;
                return handleInfo;
            }
            h = next;
        }
        return null;
    };
    SftpServerSession.prototype.deleteHandleInfo = function (handleInfo) {
        var h = handleInfo.h;
        if (h < 0)
            return;
        handleInfo.h = -1;
        var handleInfo = this._handles[h];
        if (typeof handleInfo !== 'object')
            throw new Error("Handle not found");
        delete this._handles[h];
    };
    SftpServerSession.prototype.end = function () {
        this._channel.close();
    };
    SftpServerSession.prototype._end = function () {
        var _this = this;
        if (typeof this._fs === 'undefined')
            return;
        // close all handles
        this._handles.forEach(function (handleInfo) {
            _this._fs.close(handleInfo.handle, function (err) {
            });
        });
        delete this._fs;
    };
    SftpServerSession.prototype._process = function (data) {
        var _this = this;
        var request = new SftpPacketReader(data);
        if (this._debug) {
            var meta = {
                "session": this._id,
                "req": request.id,
                "type": SftpPacket.toString(request.type),
                "length": request.length
            };
            if (this._trace)
                meta["raw"] = request;
            this._log.debug(meta, "[%d] #%d - Received request", this._id, request.id);
        }
        var response = new SftpResponse();
        if (request.type == 1 /* INIT */) {
            var version = request.readInt32();
            response.type = 2 /* VERSION */;
            response.start();
            response.writeInt32(3);
            this.send(response);
            return;
        }
        response.id = request.id;
        var handleInfo;
        switch (request.type) {
            case 4 /* CLOSE */:
            case 5 /* READ */:
            case 6 /* WRITE */:
            case 8 /* FSTAT */:
            case 10 /* FSETSTAT */:
            case 12 /* READDIR */:
                handleInfo = this.readHandleInfo(request);
                if (handleInfo == null) {
                    this.sendStatus(response, 4 /* FAILURE */, "Invalid handle");
                    return;
                }
                response.handleInfo = handleInfo;
                break;
            default:
                handleInfo = null;
                break;
        }
        if (handleInfo == null) {
            this.processRequest(request, response, null);
        }
        else if (!handleInfo.locked) {
            handleInfo.locked = true;
            this.processRequest(request, response, handleInfo);
        }
        else {
            handleInfo.tasks.push(function () {
                if (handleInfo.h < 0)
                    _this.sendStatus(response, 4 /* FAILURE */, "Invalid handle");
                else
                    _this.processRequest(request, response, handleInfo);
            });
        }
    };
    SftpServerSession.prototype.processNext = function (handleInfo) {
        if (handleInfo.tasks.length > 0) {
            var task = handleInfo.tasks.shift();
            task();
        }
        else {
            handleInfo.locked = false;
        }
    };
    SftpServerSession.prototype.processRequest = function (request, response, handleInfo) {
        var _this = this;
        var fs = this._fs;
        if (typeof fs === 'undefined') {
            // already disposed
            return;
        }
        try {
            if (request.length > 66000) {
                this.sendStatus(response, 5 /* BAD_MESSAGE */, "Packet too long");
                return;
            }
            switch (request.type) {
                case 3 /* OPEN */:
                    var path = request.readString();
                    var pflags = request.readInt32();
                    var attrs = new SftpAttributes(request);
                    var modes = SftpFlags.fromNumber(pflags);
                    if (modes.length == 0) {
                        this.sendStatus(response, 4 /* FAILURE */, "Unsupported flags");
                        return;
                    }
                    handleInfo = this.createHandleInfo();
                    if (handleInfo == null) {
                        this.sendStatus(response, 4 /* FAILURE */, "Too many open handles");
                        return;
                    }
                    var openFile = function () {
                        var mode = modes.shift();
                        fs.open(path, mode, attrs, function (err, handle) {
                            if (_this.sendIfError(response, err)) {
                                _this.deleteHandleInfo(handleInfo);
                                return;
                            }
                            if (modes.length == 0) {
                                handleInfo.handle = handle;
                                _this.sendHandle(response, handleInfo);
                                return;
                            }
                            fs.close(handle, function (err) {
                                if (_this.sendIfError(response, err)) {
                                    _this.deleteHandleInfo(handleInfo);
                                    return;
                                }
                                openFile();
                            });
                        });
                    };
                    openFile();
                    return;
                case 4 /* CLOSE */:
                    this.deleteHandleInfo(handleInfo);
                    fs.close(handleInfo.handle, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 5 /* READ */:
                    var position = request.readInt64();
                    var count = request.readInt32();
                    if (count > 0x8000)
                        count = 0x8000;
                    response.type = 103 /* DATA */;
                    response.start();
                    var offset = response.position + 4;
                    response.check(4 + count);
                    fs.read(handleInfo.handle, response.buffer, offset, count, position, function (err, bytesRead, b) {
                        if (_this.sendIfError(response, err))
                            return;
                        if (bytesRead == 0) {
                            _this.sendStatus(response, 1 /* EOF */, "EOF");
                            return;
                        }
                        response.writeInt32(bytesRead);
                        response.skip(bytesRead);
                        _this.send(response);
                    });
                    return;
                case 6 /* WRITE */:
                    var position = request.readInt64();
                    var count = request.readInt32();
                    var offset = request.position;
                    request.skip(count);
                    fs.write(handleInfo.handle, request.buffer, offset, count, position, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 7 /* LSTAT */:
                    var path = request.readString();
                    fs.lstat(path, function (err, stats) { return _this.sendAttribs(response, err, stats); });
                    return;
                case 8 /* FSTAT */:
                    fs.fstat(handleInfo.handle, function (err, stats) { return _this.sendAttribs(response, err, stats); });
                    return;
                case 9 /* SETSTAT */:
                    var path = request.readString();
                    var attrs = new SftpAttributes(request);
                    fs.setstat(path, attrs, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 10 /* FSETSTAT */:
                    var attrs = new SftpAttributes(request);
                    fs.fsetstat(handleInfo.handle, attrs, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 11 /* OPENDIR */:
                    var path = request.readString();
                    handleInfo = this.createHandleInfo();
                    if (handleInfo == null) {
                        this.sendStatus(response, 4 /* FAILURE */, "Too many open handles");
                        return;
                    }
                    fs.opendir(path, function (err, handle) {
                        if (_this.sendIfError(response, err)) {
                            _this.deleteHandleInfo(handleInfo);
                            return;
                        }
                        handleInfo.handle = handle;
                        _this.sendHandle(response, handleInfo);
                    });
                    return;
                case 12 /* READDIR */:
                    response.type = 104 /* NAME */;
                    response.start();
                    var count = 0;
                    var offset = response.position;
                    response.writeInt32(0);
                    var done = function () {
                        if (count == 0) {
                            _this.sendStatus(response, 1 /* EOF */, "EOF");
                        }
                        else {
                            response.buffer.writeInt32BE(count, offset, true);
                            _this.send(response);
                        }
                    };
                    var next = function (items) {
                        if (items === false) {
                            done();
                            return;
                        }
                        var list = items;
                        while (list.length > 0) {
                            var item = list.shift();
                            _this.writeItem(response, item);
                            count++;
                            if (response.position > 0x7000) {
                                handleInfo.items = list;
                                done();
                                return;
                            }
                        }
                        readdir();
                    };
                    var readdir = function () {
                        fs.readdir(handleInfo.handle, function (err, items) {
                            if (_this.sendIfError(response, err))
                                return;
                            next(items);
                        });
                    };
                    var previous = handleInfo.items;
                    if (previous != null && previous.length > 0) {
                        handleInfo.items = [];
                        next(previous);
                        return;
                    }
                    readdir();
                    return;
                case 13 /* REMOVE */:
                    var path = request.readString();
                    fs.unlink(path, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 14 /* MKDIR */:
                    var path = request.readString();
                    var attrs = new SftpAttributes(request);
                    fs.mkdir(path, attrs, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 15 /* RMDIR */:
                    var path = request.readString();
                    fs.rmdir(path, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 16 /* REALPATH */:
                    var path = request.readString();
                    fs.realpath(path, function (err, resolvedPath) { return _this.sendPath(response, err, resolvedPath); });
                    return;
                case 17 /* STAT */:
                    var path = request.readString();
                    fs.stat(path, function (err, stats) { return _this.sendAttribs(response, err, stats); });
                    return;
                case 18 /* RENAME */:
                    var oldpath = request.readString();
                    var newpath = request.readString();
                    fs.rename(oldpath, newpath, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case 19 /* READLINK */:
                    var path = request.readString();
                    fs.readlink(path, function (err, linkString) { return _this.sendPath(response, err, linkString); });
                    return;
                case 20 /* SYMLINK */:
                    var linkpath = request.readString();
                    var targetpath = request.readString();
                    fs.symlink(targetpath, linkpath, function (err) { return _this.sendSuccess(response, err); });
                    return;
                case SftpExtensions.HARDLINK:
                    var oldpath = request.readString();
                    var newpath = request.readString();
                    fs.link(oldpath, newpath, function (err) { return _this.sendSuccess(response, err); });
                    return;
                default:
                    this.sendStatus(response, 8 /* OP_UNSUPPORTED */, "Not supported");
            }
        }
        catch (err) {
            this.sendError(response, err, true);
        }
    };
    SftpServerSession.MAX_HANDLE_COUNT = 512;
    SftpServerSession._nextSessionId = 1;
    return SftpServerSession;
})();
exports.SftpServerSession = SftpServerSession;
