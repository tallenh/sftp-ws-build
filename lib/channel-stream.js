var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var events = require("events");
var StreamChannel = (function (_super) {
    __extends(StreamChannel, _super);
    function StreamChannel(stream) {
        var _this = this;
        _super.call(this);
        this.stream = stream;
        this.closed = false;
        var buffer = new Buffer(65 * 1024);
        var offset = 0;
        var packetLength = 0;
        this.stream.on("end", function () {
            if (_this.closed)
                return;
            _this.closed = true;
            _super.prototype.emit.call(_this, "close");
        });
        this.stream.on("error", function (err) {
            if (_this.closed)
                return;
            _this.closed = true;
            _this.stream.end();
            _super.prototype.emit.call(_this, "close", err);
        });
        this.stream.on("data", function (d) {
            if (_this.closed)
                return;
            try {
                var data = d;
                //console.info("->", data.length);
                while (data.length > 0) {
                    // if the buffer is empty, process the new block of data
                    if (offset == 0) {
                        // if it's too short, buffer it and wait for more data
                        if (data.length < 4) {
                            data.copy(buffer, offset, 0, data.length);
                            offset = data.length;
                            packetLength = 4;
                            return;
                        }
                        // determine packet length and check it
                        packetLength = data.readInt32BE(0, true) + 4;
                        if (packetLength > buffer.length || packetLength <= 4) {
                            throw new Error("Bad packet length");
                        }
                        // if only part of the packet arrived, buffer it and wait for more data
                        if (packetLength > data.length) {
                            data.copy(buffer, offset, 0, data.length);
                            offset = data.length;
                            return;
                        }
                        // whole packet arrived, process it
                        _super.prototype.emit.call(_this, "message", data.slice(0, packetLength));
                        // if there is more data, continue processing
                        if (data.length > packetLength) {
                            data = data.slice(packetLength, data.length);
                            packetLength = packetLength;
                            continue;
                        }
                        // otherwise wait for more data
                        return;
                    }
                    // copy expected data to the buffer
                    var n = Math.min(packetLength - offset, data.length);
                    data.copy(buffer, offset, 0, n);
                    offset += n;
                    data = data.slice(n);
                    // if not enough received yet, wait for more data to arrive
                    if (offset < packetLength)
                        continue;
                    // if receiving the header, parse its length and wait for the rest of data
                    if (packetLength == 4) {
                        // determine the packet length and check it
                        packetLength = buffer.readInt32BE(0, true) + 4;
                        if (packetLength > buffer.length || packetLength <= 4) {
                            throw new Error("Bad packet length");
                        }
                        // wait for more data
                        packetLength = packetLength;
                        continue;
                    }
                    // process the buffered packet
                    _super.prototype.emit.call(_this, "message", buffer.slice(0, packetLength));
                    // reset the offset and packet length
                    offset = 0;
                    packetLength = 0;
                }
            }
            catch (err) {
                if (!_this.closed) {
                    _this.closed = true;
                    _this.stream.end();
                }
                _super.prototype.emit.call(_this, "error", err);
            }
        });
    }
    StreamChannel.prototype.on = function (event, listener) {
        if (event == "ready")
            process.nextTick(listener);
        else
            _super.prototype.on.call(this, event, listener);
        return this;
    };
    StreamChannel.prototype.send = function (packet) {
        var _this = this;
        if (this.closed)
            return;
        try {
            this.stream.write(packet);
        }
        catch (err) {
            process.nextTick(function () { return _super.prototype.emit.call(_this, "error", err); });
        }
    };
    StreamChannel.prototype.close = function (reason, description) {
        var _this = this;
        if (this.closed)
            return;
        this.closed = true;
        try {
            this.stream.end();
        }
        catch (err) {
            process.nextTick(function () { return _super.prototype.emit.call(_this, "error", err); });
        }
    };
    return StreamChannel;
})(events.EventEmitter);
exports.StreamChannel = StreamChannel;
