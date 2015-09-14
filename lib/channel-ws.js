var WebSocket = require("ws");
var WebSocketChannel = (function () {
    function WebSocketChannel(ws) {
        var _this = this;
        this.ws = ws;
        this.options = { binary: true }; //WEB: // removed
        this.failed = false;
        this.wasConnected = (ws.readyState == WebSocket.OPEN);
        this.ws.on('close', function (reason, description) {
            //WEB: var reason = e.code;
            //WEB: var description = e.reason;
            _this.close(reason, description);
        }); //WEB: };
        this.ws.on('error', function (err) {
            _this.failed = true;
            if (!_this.wasConnected)
                _this.close(999, err.message, err.code); //WEB: // removed
        }); //WEB: };
        this.ws.on('message', function (data, flags) {
            var packet;
            if (flags.binary) {
                packet = data; //WEB: packet = new Uint8Array(message.data);
            }
            else {
                _this.reportError(new Error("Closed due to unsupported text packet"));
                return;
            }
            if (typeof _this.onmessage === "function")
                _this.onmessage(packet);
        }); //WEB: };
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
        this.ws.on("open", function () {
            _this.wasConnected = true;
            var onopen = _this.onopen;
            _this.onopen = null;
            if (typeof onopen === "function") {
                onopen();
            }
        }); //WEB: };
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
            this.ws.send(packet, this.options, function (err) {
                if (err)
                    _this.reportError(err); //WEB: // removed
            }); //WEB: // removed
        }
        catch (err) {
            process.nextTick(function () {
                _this.reportError(err);
            });
        }
    };
    return WebSocketChannel;
})();
exports.WebSocketChannel = WebSocketChannel;
