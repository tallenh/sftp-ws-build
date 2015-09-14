var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var misc = require("./fs-misc");
var charsets = require("./charsets");
var events = require("events");
var Path = misc.Path;
var Encoding = charsets.Encoding;
var EventEmitter = events.EventEmitter;
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
        if (this.handle === null)
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
exports.FileDataTarget = FileDataTarget;
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
exports.DataTarget = DataTarget;
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
exports.StringDataTarget = StringDataTarget;
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
exports.BlobDataTarget = BlobDataTarget;
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
        this._buffer = new Buffer(this._length);
        var offset = 0;
        for (var n = 0; n < this._chunks.length; n++) {
            var chunk = this._chunks[n];
            chunk.copy(this._buffer, offset); //WEB: this._buffer.set(chunk, offset);
            offset += chunk.length;
        }
        this._chunks.length = 0;
    };
    BufferDataTarget.prototype.result = function () {
        return this._buffer;
    };
    return BufferDataTarget;
})(DataTarget);
exports.BufferDataTarget = BufferDataTarget;
