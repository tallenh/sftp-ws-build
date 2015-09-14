var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var misc = require("./fs-misc");
var glob = require("./fs-glob");
var events = require("events");
var Path = misc.Path;
var search = glob.search;
var EventEmitter = events.EventEmitter;
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
            this.fs.read(this.handle, new Buffer(bytesToRead), 0, bytesToRead, position, function (err, bytesRead, buffer) {
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
                    var chunk = buffer.slice(0, bytesRead); //WEB: var chunk = <IChunk>buffer.subarray(0, bytesRead);
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
exports.FileDataSource = FileDataSource;
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
                var chunk = new Buffer(e.target.result);
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
exports.toDataSource = toDataSource;
