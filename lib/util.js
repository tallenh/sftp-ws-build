var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var events = require("events");
var util = require("util");
var EventEmitter = events.EventEmitter;
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
    // #if NODE
    if (check(["log", "debug", "info", "warn", "error", "query"])) {
        // looks like winston, lets's create a proxy for it
        var proxy = new Object();
        levels.forEach(function (level) {
            proxy[level] = function (obj, format) {
                var params = [];
                for (var _i = 2; _i < arguments.length; _i++) {
                    params[_i - 2] = arguments[_i];
                }
                // log(level: string, msg: string, meta: any, callback ?: (err: Error, level: string, msg: string, meta: any) => void): LoggerInstance;
                if (typeof obj === "string") {
                    var msg = util.format(obj, format, params);
                    writer.log(level, msg);
                }
                else {
                    var msg = util.format(format, params);
                    writer.log(level, msg, obj);
                }
            };
        });
        proxy["level"] = function () { return writer.level; };
        return proxy;
    }
    // #endif
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
exports.toLogWriter = toLogWriter;
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
exports.Task = Task;
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
exports.wrapCallback = wrapCallback;
