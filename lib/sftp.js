var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var WebSocket = require("ws");
var path = require("path");
var events = require("events");
var client = require("./sftp-client");
var server = require("./sftp-server");
var safe = require("./fs-safe");
var local = require("./fs-local");
var plus = require("./fs-plus");
var channel_ws = require("./channel-ws");
var channel_stream = require("./channel-stream");
var util = require("./util");
var SafeFilesystem = safe.SafeFilesystem;
var WebSocketServer = WebSocket.Server;
var WebSocketChannel = channel_ws.WebSocketChannel;
var SftpServerSession = server.SftpServerSession;
var SFTP;
(function (SFTP) {
    var Client = (function (_super) {
        __extends(Client, _super);
        function Client() {
            var localFs = new local.LocalFilesystem();
            _super.call(this, localFs);
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
            var ws = new WebSocket(address, options);
            var channel = new WebSocketChannel(ws);
            _super.prototype.bind.call(this, channel, callback);
        };
        return Client;
    })(client.SftpClient);
    SFTP.Client = Client;
    var Local = (function (_super) {
        __extends(Local, _super);
        function Local() {
            var fs = new local.LocalFilesystem();
            _super.call(this, fs, null);
        }
        return Local;
    })(plus.FilesystemPlus);
    SFTP.Local = Local;
    var Channels;
    (function (Channels) {
        Channels.StreamChannel = channel_stream.StreamChannel;
        Channels.WebSocketChannel = channel_ws.WebSocketChannel;
    })(Channels = SFTP.Channels || (SFTP.Channels = {}));
    var RequestInfo = (function () {
        function RequestInfo() {
        }
        return RequestInfo;
    })();
    SFTP.RequestInfo = RequestInfo;
    var Server = (function (_super) {
        __extends(Server, _super);
        function Server(options) {
            var _this = this;
            _super.call(this);
            var serverOptions = {};
            var noServer = false;
            var verifyClient = null;
            if (typeof options !== 'undefined') {
                this._virtualRoot = options.virtualRoot;
                this._fs = options.filesystem;
                this._log = util.toLogWriter(options.log);
                this._verifyClient = options.verifyClient;
                noServer = options.noServer;
                serverOptions.handleProtocols = this.handleProtocols;
                serverOptions.verifyClient = (function (info, callback) {
                    _this.verifyClient(info, callback);
                });
                for (var option in options) {
                    if (options.hasOwnProperty(option)) {
                        switch (option) {
                            case "filesystem":
                            case "virtualRoot":
                            case "readOnly":
                            case "log":
                            case "verifyClient":
                                break;
                            default:
                                serverOptions[option] = options[option];
                                break;
                        }
                    }
                }
            }
            if (typeof this._virtualRoot === 'undefined') {
                // TODO: serve a dummy filesystem in this case to prevent revealing any files accidently
                this._virtualRoot = process.cwd();
            }
            else {
                this._virtualRoot = path.resolve(this._virtualRoot);
            }
            if (typeof this._fs === 'undefined') {
                this._fs = new local.LocalFilesystem();
            }
            //TODO: when no _fs and no _virtualRoot is specified, serve a dummy filesystem as well
            if (!noServer) {
                this._wss = new WebSocketServer(serverOptions);
                this._wss.on('connection', function (ws) { return _this.accept(ws); });
            }
        }
        Server.prototype.verifyClient = function (info, accept) {
            this._log.info("Incoming session request from %s", info.req.connection.remoteAddress);
            var innerVerify = this._verifyClient;
            if (typeof innerVerify == 'function') {
                if (innerVerify.length >= 2) {
                    var outerAccept = function (result) {
                        if (typeof result == 'object') {
                            info.req._sftpSessionInfo = result;
                            accept(true);
                        }
                        else {
                            accept(result);
                        }
                    };
                    innerVerify(info, outerAccept);
                }
                else {
                    var result = innerVerify(info);
                    accept(result);
                }
            }
            accept(true);
        };
        Server.prototype.handleProtocols = function (protocols, callback) {
            for (var i = 0; i < protocols.length; i++) {
                var protocol = protocols[i];
                switch (protocol) {
                    case "sftp":
                        callback(true, protocol);
                        return;
                }
            }
            ;
            callback(false);
        };
        Server.prototype.end = function () {
            if (typeof this._wss === 'object') {
                // end all active sessions
                this._wss.clients.forEach(function (ws) {
                    var session = ws.session;
                    if (typeof session === 'object') {
                        session.end();
                        delete ws.session;
                    }
                });
                // stop accepting connections
                this._wss.close();
            }
        };
        Server.prototype.accept = function (ws) {
            var log = this._log;
            log.info("Connection accepted.");
            var fs = new SafeFilesystem(this._fs, this._virtualRoot, this._readOnly);
            var channel = new WebSocketChannel(ws);
            var session = new SftpServerSession(channel, fs, this, log);
            this.emit("startedSession", this);
            ws.session = session;
        };
        return Server;
    })(events.EventEmitter);
    SFTP.Server = Server;
})(SFTP || (SFTP = {}));
module.exports = SFTP;
