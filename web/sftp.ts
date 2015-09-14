module SFTP {
function __extends(d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
}

interface ErrnoException extends Error {
    errno?: number;
}

interface NodeEventEmitter extends EventEmitter {}
interface NodeBuffer extends Uint8Array {}
var undefined;

class EventEmitter {
    constructor() {
        this._events = {};
    }

    private _events: Object;

    static listenerCount(emitter: EventEmitter, event: string): number {
        if (!emitter || typeof emitter._events === "undefined") return 0;
        var list = <Function[]>emitter._events[event];
        if (!list) return 0;
        return list.length;
    }

    addListener(event: string, listener: Function): EventEmitter {
        var list = <Function[]>this._events[event] || [];
        list.push(listener);
        this._events[event] = list;
        return this;
    }

    on(event: string, listener: Function): EventEmitter {
        return this.addListener(event, listener);
    }

    once(event: string, listener: Function): EventEmitter {
        var wrapper = (...args: any[]) => {
            this.removeListener(event, wrapper);
            listener.apply(this, args);
        }

        return this.addListener(event, wrapper);
    }

    removeListener(event: string, listener: Function): EventEmitter {
        var list = <Function[]>this._events[event];
        if (!Array.isArray(list))
            return;

        var n = list.indexOf(listener);
        if (n >= 0)
            list.splice(n, 1);

        return this;
    }

    removeAllListeners(event?: string): EventEmitter {
        if (typeof event === 'string')
            delete this._events[event];
        else if (typeof event === 'undefined')
            this._events = {};

        return this;
    }

    listeners(event: string): Function[] {
        return this._events[event];
    }

    emit(event: string, ...args: any[]): boolean {
        var list = <Function[]>this._events[event];
        var called = false;
        if (Array.isArray(list)) {
            for (var i = 0; i < list.length; i++) {
                list[i].apply(null, args);
                called = true;
            }
        }
        if (!called && event == "error") {
            var error = <Error>args[0];
            console.error(error);
            throw error;
        }
        return called;
    }
}

class process {
    static nextTick(callback: Function): void {
        window.setTimeout(callback, 0);
    }

    static platform = "browser";
}



interface ILogWriter {
    trace(format: string, ...params: any[]): void;
    trace(obj: Object, format?: string, ...params: any[]): void;
    debug(format: string, ...params: any[]): void;
    debug(obj: Object, format?: string, ...params: any[]): void;
    info(format: string, ...params: any[]): void;
    info(obj: Object, format?: string, ...params: any[]): void;
    warn(format: string, ...params: any[]): void;
    warn(obj: Object, format?: string, ...params: any[]): void;
    error(format: string, ...params: any[]): void;
    error(obj: Object, format?: string, ...params: any[]): void;
    fatal(format: string, ...params: any[]): void;
    fatal(obj: Object, format?: string, ...params: any[]): void;
    level(): string|number;
}

function toLogWriter(writer?: ILogWriter): ILogWriter {

    function check(names: string[]) {
        if (typeof writer !== "object") return false;

        for (var i = 0; i < names.length; i++) {
            if (typeof writer[names[i]] !== "function") return false;
        }

        return true;
    };

    var levels = ["trace", "debug", "info", "warn", "error", "fatal"];

    if (writer == null || typeof writer === "undefined") {
        // no writer specified, create a dummy writer
        var proxy = <ILogWriter>new Object();

        levels.forEach(level => {
            proxy[level] = (obj?: Object, format?: any, ...params: any[]): void => { };
        });

        proxy["level"] = () => { return 90; }

        return <ILogWriter>proxy;
    }

    if (check(levels)) {
        // looks like bunyan, great!
        return writer;
    }

    if (check(["log", "info", "warn", "error", "dir"])) {
        // looks like console, lets's create a proxy for it
        var proxy =  <ILogWriter>new Object();
        var console = <Console><any>writer;

        levels.forEach(level => {
            proxy[level] = function (obj?: Object, format?: any, ...params: any[]): void {

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
                } else {
                    array = params;
                    array.unshift(format);
                    array.push(obj);
                }
                 
                (<Function>console[level]).apply(console, array);
            };
        });

        proxy["level"] = () => { return "debug"; }

        return <ILogWriter>proxy;
    }
    
    throw new TypeError("Unsupported log writer");
}

class Task<TResult> extends EventEmitter {
    on(event: 'success', listener: (result: TResult) => void): Task<TResult>;
    on(event: 'error', listener: (err: Error) => void): Task<TResult>;
    on(event: 'finish', listener: (err: Error, ...args: any[]) => void): Task<TResult>;
    on(event: string, listener: Function): Task<TResult>;
    on(event: string, listener: Function): Task<TResult> {
        return super.on(event, listener);
    }

    constructor() {
        super();
    }
}

function wrapCallback(owner: EventEmitter, task: EventEmitter, callback?: (err: Error, ...args: any[]) => void): (err: Error, ...args: any[]) => void {
    return finish;

    function finish(err: Error, ...args: any[]): void {
        var error = arguments[0];
        try {
            if (typeof callback === 'function') {
                callback.apply(owner, arguments);
                error = null;
            } else if (task) {
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

                } else {
                    if (EventEmitter.listenerCount(task, "error")) {
                        task.emit("error", error);
                        error = null;
                    }

                    task.emit("finish", error);
                }
            }
        } catch (err) {
            if (error) owner.emit("error", error);
            error = err;
        }

        if (error) owner.emit("error", error);
    }
}


interface IStringEncoder extends StringEncoder {
}

interface IStringDecoder extends StringDecoder {
}

class Encoding {

    constructor(name: string) {
        var encoding = (name + "").toLowerCase().replace("-", "");
        if (encoding != "utf8") throw new Error("Encoding not supported: " + name);
        //TODO: support ASCII and other encodings in addition to UTF-8
    }

    static UTF8 = new Encoding("utf8");

    getEncoder(value: string): IStringEncoder {
        return new StringEncoder(value);
    }

    getDecoder(): IStringDecoder {
        return new StringDecoder();
    }

    encode(value: string, buffer: NodeBuffer, offset: number, end?: number): number {
        return encodeUTF8(value, buffer, offset, end);
    }

    decode(buffer: NodeBuffer, offset: number, end?: number): string {
        return decodeUTF8(buffer, offset, end);
    }
}

const enum UnicodeChars {
    REPLACEMENT_CHAR = 0xFFFD,
    BOM = 0xFEFF,
}

class StringEncoder {

    private _value: string;
    private _code: number;
    private _length: number;
    private _position: number;
    private _done: boolean;

    //TODO: add write():bool, change finish() to end():void, then expect read()
    finished(): boolean {
        return this._done;
    }

    constructor(value: string) {
        if (typeof value !== "string") value = "" + value;
        this._value = value;
    }

    read(buffer: NodeBuffer, offset: number, end?: number): number {
        return encodeUTF8(this._value, buffer, offset, end, <any>this);
    }
}

function encodeUTF8(value: string, buffer: NodeBuffer, offset: number, end?: number, state?: { _code: number; _length: number; _position: number; _done: boolean; }): number {
    end = end || buffer.length;

    var code: number;
    var length: number;
    var position: number;
    if (state) {
        code = state._code | 0;
        length = state._length | 0;
        position = state._position | 0;
    } else {
        code = 0;
        length = 0;
        position = 0;
    }

    var done = false;
    var start = offset;

    while (true) {
        if (length > 0) {
            if (offset >= end) break;

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
            value = String.fromCharCode(UnicodeChars.REPLACEMENT_CHAR);
            code = 0;
        }

        if (offset >= end) break;

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
                code = UnicodeChars.REPLACEMENT_CHAR;
            } else {
                code = c;
            }
        } else {
            // handle low surrogate
            if (c >= 0xDC00 && c < 0xE000) {
                // calculate code
                code += (c & 0x3FF);
            } else {
                // invalid low surrogate
                code = UnicodeChars.REPLACEMENT_CHAR;
            }
        }

        // emit first byte in a sequence and determine what to emit next
        if (code <= 0x7F) {
            buffer[offset++] = code;
            code = 0;
        } else if (code <= 0x7FF) {
            length = 1;
            buffer[offset++] = (code >> 6) | 0xC0;
            code = (code & 0x3F) << 12;
        } else if (code <= 0xFFFF) {
            length = 2;
            buffer[offset++] = (code >> 12) | 0xE0;
            code = (code & 0xFFF) << 6;
        } else if (code <= 0x10FFFF) {
            length = 3;
            buffer[offset++] = (code >> 18) | 0xF0;
            code = (code & 0x1FFFFF);
        } else {
            code = UnicodeChars.REPLACEMENT_CHAR;
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
    } else {
        if (!done) return -1;
    }

    return offset - start;
}

class StringDecoder {
    private _text: string;
    private _code: number;
    private _length: number;
    private _position: number;
    private _removeBom: boolean;

    text(): string {
        return this._text;
    }

    write(buffer: NodeBuffer, offset: number, end: number): void {
        var bytes = decodeUTF8(buffer, offset, end, <any>this);
        var text = this._text;

        if (this._removeBom && text.length > 0) {
            if (text.charCodeAt(0) == UnicodeChars.BOM) this._text = text.substr(1);
            this._removeBom = false;
        }
    }
}

function decodeUTF8(buffer: NodeBuffer, offset: number, end?: number, state?: { _text?: string; _code?: number; _length?: number; }): string {
    end = end || buffer.length;

    var text: string;
    var code: number;
    var length: number;
    if (state) {
        text = state._text || "";
        code = state._code | 0;
        length = state._length | 0;
    } else {
        text = "";
        code = 0;
        length = 0;
    }

    while (offset < end) {
        var b = buffer[offset++];

        if (length > 0) {
            if ((b & 0xC0) != 0x80) {
                code = UnicodeChars.REPLACEMENT_CHAR;
                length = 0;
            } else {
                code = (code << 6) | (b & 0x3F);
                length--;
                if (length > 0) continue;
            }
        } else if (b <= 128) {
            code = b;
            length = 0;
        } else {
            switch (b & 0xE0) {
                case 0xE0:
                    if (b & 0x10) {
                        code = b & 0x07;
                        length = 3;
                    } else {
                        code = b & 0xF;
                        length = 2;
                    }
                    continue;
                case 0xC0:
                    code = b & 0x1F;
                    length = 1;
                    continue;
                default:
                    code = UnicodeChars.REPLACEMENT_CHAR;
                    length = 0;
                    break;
            }
        }

        // emit surrogate pairs for supplementary plane characters
        if (code >= 0x10000) {
            code -= 0x10000;
            if (code > 0xFFFFF) {
                code = UnicodeChars.REPLACEMENT_CHAR;
            } else {
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
    } else {
        if (length > 0) text += String.fromCharCode(UnicodeChars.REPLACEMENT_CHAR);
        return text;
    }
}


const enum FileType {
    FIFO = 0x1000,
    CHARACTER_DEVICE = 0x2000,
    DIRECTORY = 0x4000,
    BLOCK_DEVICE = 0x6000,
    REGULAR_FILE = 0x8000,
    SYMLINK = 0xA000,
    SOCKET = 0XC000,

    ALL = 0xF000,
}

interface IStats {
    mode?: number;
    uid?: number;
    gid?: number;
    size?: number;
    atime?: Date;
    mtime?: Date;

    isFile? (): boolean;
    isDirectory? (): boolean;
    isSymbolicLink? (): boolean;
}

interface IItem {
    filename: string;
    stats: IStats;

    longname?: string;
    path?: string;
}

interface IFilesystem {
    open(path: string, flags: string, attrs?: IStats, callback?: (err: Error, handle: any) => any): void;
    close(handle: any, callback?: (err: Error) => any): void;
    read(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error, bytesRead: number, buffer: NodeBuffer) => any): void;
    write(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error) => any): void;
    lstat(path: string, callback?: (err: Error, attrs: IStats) => any): void;
    fstat(handle: any, callback?: (err: Error, attrs: IStats) => any): void;
    setstat(path: string, attrs: IStats, callback?: (err: Error) => any): void;
    fsetstat(handle: any, attrs: IStats, callback?: (err: Error) => any): void;
    opendir(path: string, callback?: (err: Error, handle: any) => any): void;
    readdir(handle: any, callback?: (err: Error, items: IItem[]|boolean) => any): void;
    unlink(path: string, callback?: (err: Error) => any): void;
    mkdir(path: string, attrs?: IStats, callback?: (err: Error) => any): void;
    rmdir(path: string, callback?: (err: Error) => any): void;
    realpath(path: string, callback?: (err: Error, resolvedPath: string) => any): void;
    stat(path: string, callback?: (err: Error, attrs: IStats) => any): void;
    rename(oldPath: string, newPath: string, callback?: (err: Error) => any): void;
    readlink(path: string, callback?: (err: Error, linkString: string) => any): void;
    symlink(targetpath: string, linkpath: string, callback?: (err: Error) => any): void;
    link(oldPath: string, newPath: string, callback?: (err: Error) => any): void;
}



interface IDataTarget {
    name?: string;

    on(event: 'drain', listener: () => void): EventEmitter;
    on(event: 'error', listener: (err: Error) => void): EventEmitter;
    on(event: 'finish', listener: () => void): EventEmitter;
    on(event: string, listener: Function): EventEmitter;

    write(chunk: NodeBuffer, callback?: () => void): boolean;
    end(): void;

    acceptsEmptyBlocks?: boolean;
}

interface IDataSource {
    name: string;
    length: number;
    stats?: IStats;
    path?: string;
    relativePath?: string;

    on(event: 'readable', listener: () => void): EventEmitter;
    on(event: 'error', listener: (err: Error) => void): EventEmitter;
    on(event: 'end', listener: () => void): EventEmitter;
    on(event: string, listener: Function): EventEmitter;

    read(): NodeBuffer;
    close(): void;
}

class Path {
    path: string;
    fs: IFilesystem;

    constructor(path: string, fs?: IFilesystem) {
        if (typeof path !== "string") path = "" + path;
        this.path = <string>path;
        this.fs = fs || null;
    }

    private _windows(): boolean {
        return this.fs && (<any>this.fs).isWindows && true;
    }

    isTop(): boolean {
        var path = this.path;
        if (path.length == 0 || path == '/') return true;
        if (this._windows()) {
            if (path == '\\') return true;
            if (path[1] != ':') return false;
            if (path.length == 2) return true;
            if (path.length == 3 && (path[2] == '/' || path[2] == '\\')) return true;
        }
        return false;
    }

    getName(): string {
        var path = this.path;
        var windows = this._windows();
        var n = path.lastIndexOf('/');
        if (n < 0 && windows) n = path.lastIndexOf('\\');
        if (n < 0) return path;
        return path.substr(n + 1);
    }

    getParent(): Path {
        var path = this.path;
        var windows = this._windows();
        var n = path.lastIndexOf('/');
        if (n < 0 && windows) n = path.lastIndexOf('\\');
        if (n < 0) {
            path = "";
        } else if (n == 0) {
            path = "/";
        } else {
            path = path.substr(0, n);
        }

        return new Path(path, this.fs);
    }

    startsWith(value: string) {
        if (value.length == 0) return false;
        var path = this.path;
        if (path.length < value.length) return false;
        if (value.length == 1) return path[0] === value;
        for (var i = 0; i < value.length; i++) {
            if (value[i] !== path[i]) return false;
        }
        return true;
    }

    endsWithSlash(): boolean {
        var last = this.path[this.path.length - 1];
        if (last == '/') return true;
        if (last == '\\' && this._windows()) return true;
        return false;
    }

    removeTrailingSlash(): Path {
        var path = this.path;
        var windows = this._windows();

        var len = path.length;
        if (len > 1) {
            var last = path[len - 1];
            if (last == '/' || (last == '\\' && windows)) path = path.substr(0, len - 1);
        }

        return new Path(path, this.fs);
    }

    normalize(): Path {
        var path = this.path;

        // replace slashes with backslashes with on Windows filesystems
        if (this._windows()) {
            path = path.replace(/\//g, "\\");
        } else {
            path = path.replace(/\\/g, "/");
        }

        return new Path(path, this.fs);
    }

    toString(): string {
        return this.path;
    }

    join(...paths: string[]): Path
    join(...paths: Path[]): Path
    join(...paths: any[]): Path {
        var path = "" + this.path;
        var windows = this._windows();

        (<string[]>paths).forEach(segment => {
            if (typeof segment === "undefined") return;
            segment = "" + segment;
            if (segment.length == 0) return;
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
            } else {
                path = path + "/" + segment;
            }
        });

        if (path.length == 0) {
            path = ".";
        } else if (windows) {
            path = path.replace(/\//g, '\\');
        }

        return new Path(path, this.fs);
    }

    static create(path: string, fs: IFilesystem, name?: string): Path {
        path = Path.check(path, name);
        return new Path(path, fs).normalize();
    }

    static check(path: string, name?: string): string {
        if (typeof name === "undefined") name = "path";

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
    }
}

class FileUtil {

    static isDirectory(stats: IStats): boolean {
        return stats ? (stats.mode & FileType.ALL) == FileType.DIRECTORY : false; // directory
    }

    static isFile(stats: IStats): boolean {
        return stats ? (stats.mode & FileType.ALL) == FileType.REGULAR_FILE : false; // regular file
    }

    static toString(filename: string, stats: IStats): string {
        var attrs = stats.mode;

        var perms;
        switch (attrs & FileType.ALL) {
            case FileType.CHARACTER_DEVICE:
                perms = "c";
                break;
            case FileType.DIRECTORY:
                perms = "d";
                break;
            case FileType.BLOCK_DEVICE:
                perms = "b";
                break;
            case FileType.REGULAR_FILE:
                perms = "-";
                break;
            case FileType.SYMLINK:
                perms = "l";
                break;
            case FileType.SOCKET:
                perms = "s";
                break;
            case FileType.FIFO:
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

        var nlink = (typeof (<any>stats).nlink === 'undefined') ? 1 : (<any>stats).nlink;

        return perms + " " + nlink + " user group " + len + " " + date + " " + filename;
    }

    static mkdir(fs: IFilesystem, path: string, callback?: (err: Error) => any): void {
        fs.stat(path,(err, stats) => {
            if (!err) {
                if (FileUtil.isDirectory(stats)) return callback(null);
                return callback(new Error("Path is not a directory")); //TODO: better error
            }

            if ((<any>err).code != "ENOENT") return callback(err);

            fs.mkdir(path, null, callback);
        });
    }

    static copy(source: IDataSource, target: IDataTarget, emitter: EventEmitter, callback?: (err: Error) => any): void {
        var empty = true;
        var writable = true;
        var eof = false;
        var done = false;
        var error = <Error>null;
        var total = 0;
        var item = <IItem>null;

        source.on("readable",() => {
            //console.log("readable");
            if (item == null) transferring();
            while (writable) {
                if (!copy()) break;
            }
        });

        source.on("end",() => {
            //console.log("ended");
            eof = true;
            if (empty && target.acceptsEmptyBlocks) target.write(new Uint8Array(0));
            target.end();
        });

        source.on("error", err => {
            //console.log("read error", err);
            error = error || err || new Error("Unspecified error");
            eof = true;
            target.end();
        });

        target.on("drain",() => {
            //console.log("drained");
            writable = true;
            do {
                if (!copy()) break;
            } while (writable);
        });

        target.on("finish",() => {
            //console.log("finished");
            if (item) emitter.emit("transferred", item);
            exit();
        });

        target.on("error", err => {
            //console.log("write error", err);
            error = error || err || new Error("Unspecified error");
            exit();
        });

        function transferring(): void {
            var name = source.name;
            if (typeof name === "undefined") name = "" + target.name;
            var path = source.relativePath;
            if (typeof path === "undefined") path = name;

            item = {
                filename: name,
                stats: source.stats || { size: source.length },
                path: path,
            };

            emitter.emit("transferring", item);
        }

        function copy(): boolean {
            var chunk = source.read();
            if (!chunk) return false;

            empty = false;
            writable = target.write(chunk,() => {
                // The fact that write requests might in theory be completed in different order
                // doesn't concern us much because a transferred byte is still a transferred byte
                // and it will all add up to proper number in the end.
                total += chunk.length;
                emitter.emit("progress", source.path, total, source.length);
            });

            return writable;
        }

        function exit(): void {
            if (!eof) return source.close();

            if (!done) {
                done = true;
                callback(error);
            }
        }
    }
}



interface IItemExt extends IItem {
    relativePath: string;
}

interface IDirInfo {
    path: Path;
    pattern: number;
    depth: number;
}

interface IEventEmitter {
    emit(event: string, ...args: any[]): boolean;
}

interface ISearchOptions {
    nodir?: boolean; // don't match directories
    onlydir?: boolean; // only match directories
    nowildcard?: boolean; // do not allow wildcards
    noglobstar?: boolean; // do not perform globstar matching (treat "**" just like normal "*")
    noexpand?: boolean; // do not automatically append "*" to slash-ended paths
    depth?: number; // maximum globmask matching depth (0 means infinite depth)
    nosort?: boolean; // don't sort the results
    dotdirs?: boolean; // include "." and ".." entries in the results
}

interface ISearchOptionsExt extends ISearchOptions {
    listonly?: boolean; // only list a single directory (wildcards only allowed in the last path segment)
    itemonly?: boolean; // only match a single item (implies nowildcard)
}

function search(fs: IFilesystem, path: string, emitter: IEventEmitter, options: ISearchOptionsExt, callback: (err: Error, items?: IItem[]) => void): void {

    if (path.length == 0) throw new Error("Empty path");

    // use dummy emitter if not specified
    if (!emitter) emitter = {
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
    if (!matchFiles && !matchDirectories) throw new Error("Not matching anything with the specified options");

    // on windows, normalize backslashes
    var windows = (<any>fs).isWindows == true;
    path = new Path(path, null).normalize().path;

    // append a wildcard to slash-ended paths, or make sure they refer to a directory
    if (path[path.length - 1] == '/') {
        if (expandDir) {
            path += "*";
        } else {
            path = path.substr(0, path.length - 1);
            expectDir = true;
        }
    }

    // resulting item list
    var results = <IItemExt[]>[];

    // important variables
    var basePath: Path;
    var glob: RegExp;
    var queue = <IDirInfo[]>[];
    var patterns = <RegExp[]>[];

    // search for the first wildcard
    var w1 = path.indexOf('*');
    var w2 = path.indexOf('?');
    var w = (w1 < 0) ? w2 : (w2 < 0) ? w1 : w2;

    if (w >= 0) {
        // wildcard present -> split the path into base path and mask

        if (options.nowildcard || options.itemonly) throw new Error("Wildcards not allowed");

        if (options.listonly) {
            var s = path.indexOf('/', w);
            if (s > w) throw new Error("Wildcards only allowed in the last path segment");
        }

        w = path.lastIndexOf('/', w);
        var mask = path.substr(w + 1);
        if (w >= 0) {
            path = path.substr(0, w);
        } else {
            path = ".";
        }

        // start matching
        start(path, mask);
    } else {
        // no wildcards -> determine whether this is a file or directory
        fs.stat(path,(err, stats) => {
            if (err) return callback(err, null);

            try {
                if (!options.itemonly) {
                    if (FileUtil.isDirectory(stats)) {
                        // if it's a directory, start matching
                        if (expandDir) return start(path, "*");
                    } else {
                        if (expectDir) return callback(new Error("The specified path is not a directory"), null);

                        if (!FileUtil.isFile(stats)) {
                            // if it's not a file, we are done
                            return callback(null, results);
                        }

                        // otherwise, proceed to adding the item to the results and finishing
                    }
                }

                // determine item name
                w = path.lastIndexOf('/');
                var name;
                if (w < 0) {
                    name = path;
                    path = "./" + name;
                } else {
                    name = path.substr(w + 1);
                }

                // push item to the results
                var item = { filename: name, stats: stats, path: path, relativePath: name };
                results.push(item);
                emitter.emit("item", item);
                return callback(null, results);
            } catch (err) {
                return callback(err, null);
            }
        });
    }

    return;

    // prepare and start the matching
    function start(path: string, mask: string): void {
        // construct base path
        if (path.length == 0 || (windows && path.length == 2 && path[1] == ':')) path += "/";
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
                } else if (mask[gs + 3] == '/') {
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
                results.sort((a, b) => {
                    if (a.relativePath < b.relativePath) return -1;
                    if (a.relativePath > b.relativePath) return 1;
                    return 0;
                });
            }

            return callback(null, results);
        }

        var relativePath: Path;
        var index: number;
        var regex: RegExp;
        var depth: number;

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
            } else {
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
            fs.opendir(fullPath,(err, handle) => {
                if (err) return callback(err, null);

                emitter.emit("traversing", fullPath);

                // send 1 read request
                var error = null;
                var requests = 1;
                fs.readdir(handle, read);

                function read(err: Error, items: IItem[]|boolean): void {
                    try {
                        requests--;
                        error = error || err;
                        if (error || !items) {
                            if (requests > 0) return;

                            // when done, close the handle
                            fs.close(handle, err => {
                                error = error || err;
                                if (err) return callback(error, null);

                                emitter.emit("traversed", fullPath);

                                // process next directory
                                next();
                            });
                            return;
                        }

                        // process items
                        (<IItemExt[]>items).forEach(process);

                        // read next items using several parallel readdir requests
                        while (requests < 2) {
                            fs.readdir(handle, read);
                            requests++;
                        }
                    } catch (err) {
                        error = error || err;
                        return callback(error, null);
                    }
                }
            });
        } catch (err) {
            return callback(err, null);
        }

        // process a single item
        function process(item: IItemExt): void {
            var isDir = FileUtil.isDirectory(item.stats);
            var isFile = FileUtil.isFile(item.stats);

            var isDotDir = (item.filename == "." || item.filename == "..");
            if (isDotDir && !matchDotDirs) return;

            if (!isDir && !isFile) return;

            var itemPath = relativePath.join(item.filename);

            // add subdirectory to queue if desired
            if (enterDirs && isDir && !isDotDir) {
                queue.push({ path: itemPath, pattern: nextIndex, depth: depth });
            }

            // if not matching items in this directory, we are done with it
            if (!matchItems) return;

            // reject items we don't want
            if (isDir && !matchDirectories) return;
            if (isFile && !matchFiles) return;

            if (regex) {
                // mask matching
                if (!regex.test(item.filename)) return;
            } else {
                // globstar matching
                if (!glob.test(itemPath.path)) return;
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
    function toRegExp(mask: string, globstar: boolean): RegExp {
        var pattern = "^";
        if (globstar) pattern += ".*";
        for (var i = 0; i < mask.length; i++) {
            var c = mask[i];
            switch (c) {
                case '/':
                    var gm = mask.substr(i, 4);
                    if (gm == "/**/" || gm == "/**") {
                        pattern += ".*";
                        i += 3;
                    } else {
                        pattern += '/';
                    }
                    break;
                case '*':
                    if (globstar) {
                        pattern += "[^/]*";
                    } else {
                        pattern += ".*";
                    }
                    break;
                case '?':
                    pattern += ".";
                    break;
                default:
                    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
                        pattern += c;
                    } else {
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



interface IChunk extends NodeBuffer {
    position: number;
}

class FileDataSource extends EventEmitter implements IDataSource {
    name: string;
    path: string;
    relativePath: string;
    length: number;
    stats: IStats;

    private fs: IFilesystem;

    private handle: any;
    private nextChunkPosition: number;
    private expectedPosition: number;

    private queue: IChunk[];
    private started: boolean;
    private eof: boolean;
    private closed: boolean;
    private ended: boolean;
    private requests: number;
    private readable: boolean;
    private failed: boolean;

    constructor(fs: IFilesystem, path: string, relativePath?: string, stats?: IStats, position?: number) {
        super();
        this.fs = fs;
        this.path = "" + path;
        this.name = new Path(path, fs).getName();
        if (relativePath !== null && typeof relativePath !== "undefined") this.relativePath = "" + relativePath;

        if (stats) {
            this.length = stats.size;
            this.stats = stats;
        } else {
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

    on(event: string, listener: Function): EventEmitter {
        this._flush();
        return super.on(event, listener);
    }

    private _flush(): void {
        try {
            if (this.closed || this.eof) {
                // if there are still outstanding requests, do nothing yet
                if (this.requests > 0) return;

                // if the file is still open, close it
                if (this.handle != null) return this._close();

                // wait for all readable blocks to be read
                if (this.readable) return;

                // end when there is nothing else to wait for
                if (!this.ended) {
                    this.ended = true;
                    if (!this.failed)
                        process.nextTick(() => super.emit('end'));
                }

                return;
            }

            // open the file if not open yet
            if (!this.started) return this._open();

            // return if not open
            if (this.handle == null) return;

            // read more data if possible
            while (this.requests < 4) {
                if (this.closed)
                    break;

                if ((this.nextChunkPosition - this.expectedPosition) > 0x20000)
                    break;

                var chunkSize = 0x8000;
                this._next(this.nextChunkPosition, chunkSize);
                this.nextChunkPosition += chunkSize
            }
        } catch (err) {
            this._error(err);
        }
    }

    private _next(position: number, bytesToRead: number): void {
        //console.log("read", position, bytesToRead);
        this.requests++;
        try {
            this.fs.read(this.handle, new Uint8Array(bytesToRead), 0, bytesToRead, position,(err, bytesRead, buffer) => {
                this.requests--;
                //console.log("read result", err || position, bytesRead);

                if (err) return this._error(err);

                if (this.closed) {
                    this._flush();
                    return;
                }

                if (bytesRead == 0) {
                    this.eof = true;
                    this._flush();
                    return;
                }

                try {
                    // prepare the chunk for the queue
                    var chunk = <IChunk>buffer.subarray(0, bytesRead);
                    chunk.position = position;

                    // insert the chunk into the appropriate position in the queue
                    var index = this.queue.length
                    while (--index >= 0) {
                        if (position > this.queue[index].position)
                            break;
                    }
                    this.queue.splice(++index, 0, chunk);

                    // if incomplete chunk was received, read the rest of its data
                    if (bytesRead > 0 && bytesRead < bytesToRead)
                        this._next(position + bytesRead, bytesToRead - bytesRead);

                    this._flush();

                    if (!this.readable && index == 0 && chunk.position == this.expectedPosition) {
                        this.readable = true;
                        if (chunk.length > 0)
                            super.emit('readable');
                    }
                } catch (err) {
                    this._error(err);
                }
            });
        } catch (err) {
            this.requests--;
            this._error(err);
        }
    }

    read(): NodeBuffer {
        var chunk = this.queue[0];
        if (chunk && chunk.position == this.expectedPosition) {
            this.expectedPosition += chunk.length;
            this.queue.shift();
            if (this.queue.length == 0 || this.queue[0].position != this.expectedPosition)
                this.readable = false;
        } else {
            chunk = null;
        }

        this._flush();

        return chunk;
    }

    private _error(err: Error): void {
        this.closed = true;
        this.failed = true;
        this.queue = [];
        this._flush();
        process.nextTick(() => super.emit('error', err));
    }

    private _open(): void {
        if (this.started) return;

        this.started = true;
        try {
            this.fs.open(this.path, "r",(err, handle) => {
                if (err) return this._error(err);

                if (this.stats) {
                    this.handle = handle;
                    this._flush();
                    return;
                }

                // determine stats if not available yet
                try {
                    this.fs.fstat(handle,(err, stats) => {
                        if (err) return this._error(err);

                        this.handle = handle;
                        this.stats = stats;
                        this.length = stats.size;
                        this._flush();
                        return;
                    });
                } catch (err) {
                    this._error(err);
                }
            });
        } catch (err) {
            this._error(err);
        }
    }

    private _close(): void {
        if (!this.handle) return;

        var handle = this.handle;
        this.handle = null;
        try {        
            this.fs.close(handle, err => {
                if (err) return this._error(err);
                this._flush();
            });
            return;
        } catch (err) {
            this._error(err);
        }
    }

    close(): void {
        this.closed = true;
        this.queue = [];
        this._flush();
    }
}

class BlobDataSource extends EventEmitter implements IDataSource {
    name: string;
    length: number;

    private blob: Blob;
    private pos: number;
    private reader: FileReader;
    private busy: boolean;
    private readable: boolean;
    private finished: boolean;
    private ended: boolean;
    private queue: NodeBuffer[];

    constructor(blob: Blob, position: number) {
        super();
        this.name = (<any>blob).name;
        this.length = blob.size;

        this.blob = blob;
        this.pos = position;
        this.reader = new FileReader();
        this.busy = false;
        this.readable = false;
        this.finished = false;
        this.ended = false;
        this.queue = [];

        this.reader.onload = (e: any) => {
            this.busy = false;

            if (!this.finished) {
                var chunk = new Uint8Array(e.target.result);
                if (chunk.length > 0) {
                    this.queue.push(chunk);
                    if (!this.readable) {
                        this.readable = true;
                        super.emit('readable');
                    }
                } else {
                    this.finished = true;
                }
            }

            this.flush();
        };
    }

    on(event: string, listener: Function): EventEmitter {
        this.flush();
        return super.on(event, listener);
    }

    private flush(): void {
        try {
            if (this.finished) {
                if (!this.ended) {
                    this.ended = true;
                    process.nextTick(() => super.emit('end'));
                }

                return;
            }

            if (!this.busy && this.queue.length < 4) {
                var slice = this.blob.slice(this.pos, this.pos + 0x8000);
                this.pos += slice.size;
                this.busy = true;
                this.reader.readAsArrayBuffer(slice);
            }

        } catch (err) {
            this.finished = true;
            this.ended = true;
            this.queue = [];
            process.nextTick(() => super.emit('error', err));
        }
    }

    read(): NodeBuffer {
        var chunk = this.queue.shift();
        if (!chunk) {
            chunk = null;
            this.readable = false;
        }
        
        this.flush();
        return chunk;
    }

    close(): void {
        this.finished = true;
        this.flush();
    }
}

function toDataSource(fs: IFilesystem, input: any, emitter: EventEmitter, callback: (err: Error, sources?: IDataSource[]) => void): void {
    try
    {
        toAnyDataSource(input, callback);
    } catch (err) {
        process.nextTick(() => callback(err));
    }

    function toAnyDataSource(input: any, callback: (err: Error, source?: IDataSource[]) => void): void {
        // arrays
        if (isArray(input)) return toArrayDataSource(<any[]>input);

        // string paths
        if (isString(input)) return toPatternDataSource(<string>input);

        // Blob objects
        if (isFileBlob(input)) return openBlobDataSource(input);

        throw new Error("Unsupported source");
    }

    function openBlobDataSource(blob: Blob): void {
        process.nextTick(() => {
            var source = <IDataSource><any>new BlobDataSource(blob, 0);
            callback(null, [source]);
        });
    }

    function isFileBlob(input: any): boolean {
        return (typeof input === "object" && typeof input.size === "number" && typeof input.name === "string" && typeof input.slice == "function");
    }

    function isString(input: any): boolean {
        return typeof input === "string";
    }

    function isArray(input: any) {
        if (Array.isArray(input)) return true;
        if (typeof input !== "object" || typeof input.length !== "number") return false;
        if (input.length == 0) return true;
        return isString(input) || isFileBlob(input[0]);
    }

    function toArrayDataSource(input: any[]): void {
        var source = <IDataSource[]>[];
        var array = <any[]>[];
        Array.prototype.push.apply(array, input);
        next();

        function next(): void {
            try {
                var item = array.shift();
                if (!item) return callback(null, source);

                if (isArray(item)) throw new Error("Unsupported array of arrays data source");

                if (isString(item))
                    toItemDataSource(<string>item, add);
                else
                    toAnyDataSource(item, add);
            } catch (err) {
                process.nextTick(() => callback(err));
            }
        }

        function add(err: Error, src: IDataSource[]): void {
            if (err) return callback(err, null);
            Array.prototype.push.apply(source, src);
            next();
        }
    }

    function toItemDataSource(path: string, callback: (err: Error, source?: IDataSource[]) => void): void {
        if (!fs) throw new Error("Source file system not available");

        fs.stat(path,(err, stats) => {
            if (err) return callback(err, null);

            var item = new FileDataSource(fs, path, null, stats, 0);
            callback(null, [item]);
        });
    }

    function toPatternDataSource(path: string): void {
        if (!fs) throw new Error("Source file system not available");

        search(fs, path, emitter, {noexpand: true},(err, items) => {
            if (err) return callback(err, null);

            var source = <IDataSource[]>[];
            items.forEach(it => {
                var item = new FileDataSource(fs, it.path, (<any>it).relativePath, it.stats, 0);
                source.push(item);
            });

            callback(null, source);
        });
    }
}





interface IChunk extends NodeBuffer {
    callback?: () => void;
}

class FileDataTarget extends EventEmitter implements IDataTarget {
    name: string;

    private fs: IFilesystem;
    private path: string;

    private handle: any;
    private position: number;

    private queue: IChunk[];
    private requests: number;

    private started: boolean;
    private ready: boolean;
    private ended: boolean;
    private finished: boolean;
    private failed: boolean;

    acceptsEmptyBlocks: boolean;

    on(event: string, listener: Function): EventEmitter {
        return super.on(event, listener);
    }

    constructor(fs: IFilesystem, path: string) {
        super();

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

    private _flush(sync: boolean): void {
        if (this.ended) {
            // if there are no outstanding requests or queued data, do the cleanup
            if (this.requests == 0 && this.queue.length == 0) {

                // if the file is still open, close it
                if (this.handle != null) return this._close();

                // finish when there is nothing else to wait for
                if (!this.finished) {
                    this.finished = true;
                    if (sync)
                        process.nextTick(() => super.emit('finish'));
                    else
                        super.emit('finish');
                }

                return;
            }
        }

        // return if not open
        if (!this.handle) return;

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
                if (!sync) super.emit('drain');
            }
        } catch (err) {
            this._error(err);
        }
    }

    private _next(chunk: IChunk, position: number): void {
        var bytesToWrite = chunk.length;

        //console.log("write", position, bytesToWrite);
        this.requests++;
        try {
            this.fs.write(this.handle, chunk, 0, bytesToWrite, position, err => {
                this.requests--;
                //console.log("write done", err || position);

                if (err) return this._error(err);

                if (typeof chunk.callback === "function") chunk.callback();

                this._flush(false);
            });
        } catch (err) {
            this.requests--;
            this._error(err);
        }
    }

    private _error(err: Error): void {
        this.ready = false;
        this.ended = true;
        this.finished = true;
        this.queue = [];
        this._flush(false);
        process.nextTick(() => super.emit('error', err));
    }

    write(chunk: NodeBuffer, callback?: () => void): boolean {
        // don't accept more data if ended
        if (this.ended)
            return false;

        // enqueue the chunk for processing
        if (chunk.length > 0) {
            (<IChunk>chunk).callback = callback;
            this.queue.push(<IChunk>chunk);
        }

        // open the file if not started yet
        if (!this.started) {
            this._open();
            return false;
        }

        this._flush(true);
        return this.ready;
    }

    private _open(): void {
        if (this.started) return;

        this.started = true;
        try {
            this.fs.open(this.path, "w",(err, handle) => {
                if (err) return this._error(err);

                this.handle = handle;
                this._flush(false);
            });
        } catch (err) {
            this._error(err);
        }
    }

    private _close(): void {
        if (!this.handle) return;

        var handle = this.handle;
        this.handle = null;
        try {
            this.fs.close(handle, err => {
                if (err) return this._error(err);
                this._flush(false);
            });
        } catch (err) {
            this._error(err);
        }
    }

    end(): void {
        this.ready = false;
        this.ended = true;
        this._flush(true);
    }
}

class DataTarget extends EventEmitter implements IDataTarget {
    constructor() {
        super();
    }

    on(event: string, listener: Function): EventEmitter {
        return super.on(event, listener);
    }

    protected _data(chunk: NodeBuffer): void {
        super.emit('data', chunk);
    }

    protected _end(): void {
        super.emit('end');
    }

    write(chunk: NodeBuffer, callback?: () => void): boolean {
        // we don't have to do this in the next tick because our caller doesn't need that either
        this._data(chunk);
        if (typeof callback === "function") callback();
        return true;
    }

    end(): void {
        // we don't have to do this in the next tick because our caller doesn't need that either
        this._end();
        super.emit('finish');
    }
}

class StringDataTarget extends DataTarget {
    private _decoder: IStringDecoder;

    constructor(encoding: string) {
        super();
        this._decoder = new Encoding(encoding).getDecoder();
    }

    protected _data(chunk: NodeBuffer): void {
        this._decoder.write(chunk, 0, chunk.length);
    }

    protected _end(): void {
    }

    result() {
        return this._decoder.text();
    }
}

class BlobDataTarget extends DataTarget {
    private _chunks: NodeBuffer[];
    private _blob: Blob;
    private _mimeType: string;

    constructor(mimeType?: string) {
        super();
        this._chunks = [];
        this._mimeType = mimeType;
    }

    protected _data(chunk: NodeBuffer): void {
        this._chunks.push(chunk);
    }

    protected _end(): void {
        var options;
        if (this._mimeType) options = { type: this._mimeType };
        this._blob = new Blob(this._chunks, options);
        this._chunks.length = 0;
    }

    result() {
        return this._blob;
    }
}

class BufferDataTarget extends DataTarget {
    private _chunks: NodeBuffer[];
    private _buffer: NodeBuffer;
    private _length: number;

    constructor() {
        super();
        this._chunks = [];
        this._length = 0;
    }

    protected _data(chunk: NodeBuffer): void {
        this._length += chunk.length;
        this._chunks.push(chunk);
    }

    protected _end(): void {
        this._buffer = new Uint8Array(this._length);
        var offset = 0;
        for (var n = 0; n < this._chunks.length; n++) {
            var chunk = this._chunks[n];
            this._buffer.set(chunk, offset);
            offset += chunk.length;
        }
        this._chunks.length = 0;
    }

    result() {
        return this._buffer;
    }
}



interface IFilesystemExt extends FilesystemPlus {
}

class FilesystemPlus extends EventEmitter implements IFilesystem {

    protected _fs: IFilesystem;
    protected _local: IFilesystem;

    constructor(fs: IFilesystem, local: IFilesystem) {
        super();
        this._fs = fs;
        this._local = local;
    }

    open(path: string, flags: string, attrs?: IStats, callback?: (err: Error, handle: any) => any): void {
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = <any>attrs;
            attrs = null;
        }
        callback = wrapCallback(this, null, callback);

        this._fs.open(path, flags, attrs, callback);
    }

    close(handle: any, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.close(handle, callback);
    }

    read(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error, bytesRead: number, buffer: NodeBuffer) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.read(handle, buffer, offset, length, position, callback);
    }

    write(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.write(handle, buffer, offset, length, position, callback);
    }

    lstat(path: string, callback?: (err: Error, attrs: IStats) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.lstat(path, callback);
    }

    fstat(handle: any, callback?: (err: Error, attrs: IStats) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.fstat(handle, callback);
    }

    setstat(path: string, attrs: IStats, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.setstat(path, attrs, callback);
    }

    fsetstat(handle: any, attrs: IStats, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.fsetstat(handle, attrs, callback);
    }

    opendir(path: string, callback?: (err: Error, handle: any) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.opendir(path, callback);
    }

    readdir(path: string, callback?: (err: Error, items: IItem[]) => any): void
    readdir(handle: any, callback?: (err: Error, items: IItem[]|boolean) => any): void
    readdir(handle: any, callback?: (err: Error, items: IItem[]|boolean) => any): void {
        if (typeof handle === 'string') {
            var path = Path.check(<string>handle, 'path');

            var options = <ISearchOptionsExt>{
                noglobstar: true,
                nowildcard: true,
                listonly: true,
                dotdirs: true,
            };

            search(this._fs, path, null, options, callback);

            return;
        }

        callback = wrapCallback(this, null, callback);

        return this._fs.readdir(handle, callback);
    }

    unlink(path: string, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.unlink(path, callback);
    }

    mkdir(path: string, attrs?: IStats, callback?: (err: Error) => any): void {
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = <any>attrs;
            attrs = null;
        }
        callback = wrapCallback(this, null, callback);

        this._fs.mkdir(path, attrs, callback);
    }

    rmdir(path: string, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.rmdir(path, callback);
    }

    realpath(path: string, callback?: (err: Error, resolvedPath: string) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.realpath(path, callback);
    }

    stat(path: string, callback?: (err: Error, attrs: IStats) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.stat(path, callback);
    }

    rename(oldPath: string, newPath: string, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.rename(oldPath, newPath, callback);
    }

    readlink(path: string, callback?: (err: Error, linkString: string) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.readlink(path, callback);
    }

    symlink(targetpath: string, linkpath: string, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.symlink(targetpath, linkpath, callback);
    }

    join(...paths: string[]): string {
        var path = new Path("", this._fs);
        return path.join.apply(path, arguments).normalize().path;
    }

    link(oldPath: string, newPath: string, callback?: (err: Error) => any): void {
        callback = wrapCallback(this, null, callback);

        this._fs.link(oldPath, newPath, callback);
    }

    list(remotePath: string, callback?: (err: Error, items: IItem[]) => any): Task<IItem[]> {
        var remotePath = Path.check(remotePath, 'remotePath');

        var options = <ISearchOptionsExt>{
            directories: true,
            files: true,
            nosort: false,
            dotdirs: false,
            noglobstar: true,
            listonly: true,
        };
        
        var task = new Task();
        callback = wrapCallback(this, task, callback);

        search(this._fs, remotePath, task, options, callback);

        return task;
    }

    search(remotePath: string, options?: ISearchOptions, callback?: (err: Error, items: IItem[]) => any): Task<IItem[]> {
        var remotePath = Path.check(remotePath, 'remotePath');

        if (typeof options === 'function' && typeof callback === 'undefined') {
            callback = <any>options;
            options = null;
        }

        var task = new Task();
        callback = wrapCallback(this, task, callback);

        search(this._fs, remotePath, task, options, callback);

        return task;
    }

    info(remotePath: string, callback?: (err: Error, item: IItem) => any): Task<IItem> {
        var remotePath = Path.check(remotePath, 'remotePath');

        var options = <ISearchOptionsExt>{
            itemonly: true,
        };

        var task = new Task();
        callback = wrapCallback(this, task, callback);

        search(this._fs, remotePath, task, options,(err, items) => {
            if (err) return callback(err, null);
            if (!items || items.length != 1) return callback(new Error("Unexpected result"), null);
            callback(null, items[0]);
        });

        return task;
    }

    readFile(remotePath: string, options?: { type?: string; encoding?: string; flag?: string; mimeType?: string; }, callback?: (err: Error, data: any) => any): Task<{}> {
        var remote = Path.create(remotePath, this._fs, 'remotePath');

        if (typeof options === 'function' && typeof callback === 'undefined') {
            callback = <any>options;
            options = null;
        }

        var task = new Task();
        callback = wrapCallback(this, task, callback);

        // process options
        options = options || {};
        var type = options.type;
        var encoding = options.encoding
        if (type) {
            type = (type + "").toLowerCase();
            if (type == "string" || type == "text") encoding = encoding || "utf8";
        } else {
            type = encoding ? "string" : "buffer";
        }

        // create appropriate target
        var target: IDataTarget;
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
        FileUtil.copy(source, target, task, err => {
            if (err) return callback(err, null);
            callback(null, (<any>target).result());
        });

        return task;
    }

    putFile(localPath: string, remotePath: string, callback?: (err: Error) => any): Task<{}> {
        var local = Path.create(localPath, this._local, 'localPath');
        var remote = Path.create(remotePath, this._fs, 'remotePath');

        return this._copyFile(local, remote, callback);
    }

    getFile(remotePath: string, localPath: string, callback?: (err: Error) => any): Task<{}> {
        var remote = Path.create(remotePath, this._fs, 'remotePath');
        var local = Path.create(localPath, this._local, 'localPath');

        return this._copyFile(remote, local, callback);
    }

    private _copyFile(sourcePath: Path, targetPath: Path, callback?: (err: Error) => any): Task<{}> {
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
        FileUtil.copy(source, target, task, err => callback(err));

        return task;
    }

    upload(localPath: string, remotePath: string, callback?: (err: Error) => any): Task<{}>
    upload(input: any, remotePath: string, callback?: (err: Error) => any): Task<{}>
    upload(input: any, remotePath: string, callback?: (err: Error) => any): Task<{}> {
        var remote = Path.create(remotePath, this._fs, 'remotePath');

        return this._copy(input, this._local, remote, callback);
    }

    download(remotePath: string|string[], localPath: string, callback?: (err: Error) => any): Task<{}> {
        var local = Path.create(localPath, this._local, 'localPath');

        return this._copy(remotePath, this._fs, local, callback);
    }

    private _copy(from: any, fromFs: IFilesystem, toPath: Path, callback?: (err: Error) => any): Task<{}> {
        var task = new Task();
        callback = wrapCallback(this, task, callback);

        var sources = <IDataSource[]>null;

        var toFs = toPath.fs;
        toPath = toPath.removeTrailingSlash();

        toFs.stat(toPath.path, prepare);

        var directories = {};

        return task;

        function prepare(err: Error, stats: IStats): void {
            if (err) return callback(err);

            if (!FileUtil.isDirectory(stats))
                return callback(new Error("Target path is not a directory"));

            try {
                toDataSource(fromFs, from, task,(err, src) => {
                    if (err) return callback(err);

                    try {
                        sources = src;
                        sources.forEach(source => {
                            //TODO: calculate total size
                            //TODO: make sure that source.name is valid on target fs
                        });

                        next();
                    } catch (err) {
                        callback(err);
                    }
                });
            } catch (err) {
                callback(err);
            }
        }

        function next(): void {
            var source = sources.shift();
            if (!source) return callback(null);

            var targetPath: string;
            if (typeof source.relativePath === "string") {
                var relativePath = new Path(source.relativePath, fromFs);
                targetPath = toPath.join(relativePath).normalize().path;
                checkParent(relativePath, transfer);
            } else {
                targetPath = toPath.join(source.name).path;
                transfer(null);
            }

            function transfer(err: Error): void {
                if (err) return callback(err);

                if (FileUtil.isDirectory(source.stats)) {
                    FileUtil.mkdir(toFs, targetPath, transferred);
                } else {
                    var target = new FileDataTarget(toFs, targetPath);
                    FileUtil.copy(source, target, task, transferred);
                }
            }

            function transferred(err: Error): void {
                if (err) return callback(err);
                next();
            }
        }

        function checkParent(path: Path, callback: (err: Error) => void) {

            var parent = path.getParent();

            if (parent.isTop()) return callback(null);

            var exists = directories[<any>parent];
            if (exists) return callback(null);

            checkParent(parent, err => {
                if (err) return callback(err);

                try {
                    var targetPath = toPath.join(parent).path;

                    FileUtil.mkdir(toFs, targetPath, err => {
                        if (err) return callback(err);
                        directories[<any>parent] = true;
                        callback(null);
                    });
                } catch (err) {
                    callback(err);
                }
            });
        }
    }

}
interface IChannel {
    on(event: string, listener: Function): IChannel;
    send(packet: NodeBuffer): void;
    close(reason?: number, description?: string): void;
}



class WebSocketChannel implements IChannel {
    private ws: WebSocket;
    // removed
    private wasConnected: boolean;
    private failed: boolean;
    private onopen: () => void;
    private onclose: (err: Error) => void;
    private onmessage: (packet: NodeBuffer) => void;
    private onerror: (err: Error) => void;

    private open(callback: () => void): void {
        if (typeof callback !== "function")
            callback = function () { };

        var reason = 0;
        var error = <string>null;
        switch (this.ws.readyState) {
            case WebSocket.CLOSED:
            case WebSocket.CLOSING:
                reason = 999;
                error = "WebSocket has been closed";
                break;
            case WebSocket.OPEN:
                this.wasConnected = true;
                process.nextTick(() => callback());
                return;
            case WebSocket.CONNECTING:
                break;
            default:
                reason = 999;
                error = "WebSocket state is unknown";
                break;
        }

        if (error != null) {
            process.nextTick(() => {
                this.close(reason, error);
            });
            return;
        }

        this.onopen = callback;

        this.ws.onopen = () => {
            this.wasConnected = true;
            var onopen = this.onopen;
            this.onopen = null;
            if (typeof onopen === "function") {
                onopen();
            }
        };
    }

    on(event: string, listener: Function): IChannel {
        switch (event) {
            case "ready":
                this.open(<any>listener);
                break;
            case "message":
                this.onmessage = <any>listener;
                break;
            case "close":
                this.onclose = <any>listener;
                break;
            case "error":
                this.onerror = <any>listener;
                break;
            default:
                break;
        }
        return this;
    }

    constructor(ws: WebSocket) {
        this.ws = ws;
        // removed
        this.failed = false;
        this.wasConnected = (ws.readyState == WebSocket.OPEN);

        this.ws.onclose = e => {
            var reason = e.code;
            var description = e.reason;
            this.close(reason, description);
        };
        
        this.ws.onerror = err => {
            this.failed = true;
            // removed
        };

        this.ws.onmessage = message => {
            var packet: NodeBuffer;
            if (true) { //TODO: handle text messages
                packet = new Uint8Array(message.data);
            } else {
                this.reportError(new Error("Closed due to unsupported text packet"));
                return;
            }

            if (typeof this.onmessage === "function") this.onmessage(packet);
        };
    }

    private reportError(err: Error): void {
        if (typeof this.onerror === "function") this.onerror(err);
        else throw err;
    }

    close(reason: number, description?: string, code?: string): void {
        if (typeof reason !== 'number')
            reason = 1000;

        description = "" + description;
        code = code || "EFAILURE";

        if (this.ws != null) {
            try {
                this.ws.close();
            } catch (err) {
                this.reportError(err);
            } finally {
                this.ws = null;
            }
        }

        var onclose = this.onclose;
        this.onopen = null;
        this.onclose = null;
        if (typeof onclose === "function") {
            var err = null;

            var message: string;

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
                } else if (this.failed) {
                    message = "Connection failed";
                    code = "ECONNRESET";
                }

                err = <any>new Error(message);
                if (reason >= 1000) err.reason = reason;
                err.code = code;
            }

            onclose(err);
        }
    }

    send(packet: NodeBuffer): void {
        if (this.ws == null)
            return;

        try {
            this.ws.send(packet);
                // removed
            // removed
        } catch (err) {
            process.nextTick(() => {
                this.reportError(err);
            });
        }
    }

}
const enum SftpPacketType {

    // initialization
    INIT = 1,
    VERSION = 2,

    // requests
    OPEN = 3,
    CLOSE = 4,
    READ = 5,
    WRITE = 6,
    LSTAT = 7,
    FSTAT = 8,
    SETSTAT = 9,
    FSETSTAT = 10,
    OPENDIR = 11,
    READDIR = 12,
    REMOVE = 13,
    MKDIR = 14,
    RMDIR = 15,
    REALPATH = 16,
    STAT = 17,
    RENAME = 18,
    READLINK = 19,
    SYMLINK = 20,
    EXTENDED = 200,

    // responses
    STATUS = 101,
    HANDLE = 102,
    DATA = 103,
    NAME = 104,
    ATTRS = 105,
    EXTENDED_REPLY = 201,
}

const enum SftpStatusCode {
    OK = 0,
    EOF = 1,
    NO_SUCH_FILE = 2,
    PERMISSION_DENIED = 3,
    FAILURE = 4,
    BAD_MESSAGE = 5,
    NO_CONNECTION = 6,
    CONNECTION_LOST = 7,
    OP_UNSUPPORTED = 8,
}

const enum SftpOpenFlags {
    READ = 0x0001,
    WRITE = 0x0002,
    APPEND = 0x0004,
    CREATE = 0x0008,
    TRUNC = 0x0010,
    EXCL = 0x0020,

    ALL = 0x003F,
}



class SftpPacket {
    type: SftpPacketType|string;
    id: number;

    buffer: NodeBuffer;
    position: number;
    length: number;

    constructor() {
    }

    check(count: number): void {
        var remaining = this.length - this.position;
        if (count > remaining)
            throw new Error("Unexpected end of packet");
    }

    skip(count: number): void {
        this.check(count);
        this.position += count;
    }

    static isBuffer(obj: any): boolean {
        return obj && obj.buffer instanceof ArrayBuffer && typeof obj.byteLength !== "undefined";
    }

    static toString(packetType: SftpPacketType|string): string {
        switch (packetType) {
            case SftpPacketType.INIT: return "INIT";
            case SftpPacketType.VERSION: return "VERSION";
            case SftpPacketType.OPEN: return "OPEN";
            case SftpPacketType.CLOSE: return "CLOSE";
            case SftpPacketType.READ: return "READ";
            case SftpPacketType.WRITE: return "WRITE";
            case SftpPacketType.LSTAT: return "LSTAT";
            case SftpPacketType.FSTAT: return "FSTAT";
            case SftpPacketType.SETSTAT: return "SETSTAT";
            case SftpPacketType.FSETSTAT: return "FSETSTAT";
            case SftpPacketType.OPENDIR: return "OPENDIR";
            case SftpPacketType.READDIR: return "READDIR";
            case SftpPacketType.REMOVE: return "REMOVE";
            case SftpPacketType.MKDIR: return "MKDIR";
            case SftpPacketType.RMDIR: return "RMDIR";
            case SftpPacketType.REALPATH: return "REALPATH";
            case SftpPacketType.STAT: return "STAT";
            case SftpPacketType.RENAME: return "RENAME";
            case SftpPacketType.READLINK: return "READLINK";
            case SftpPacketType.SYMLINK: return "SYMLINK";
            case SftpPacketType.EXTENDED: return "EXTENDED";
            case SftpPacketType.STATUS: return "STATUS";
            case SftpPacketType.HANDLE: return "HANDLE";
            case SftpPacketType.DATA: return "DATA";
            case SftpPacketType.NAME: return "NAME";
            case SftpPacketType.ATTRS: return "ATTRS";
            case SftpPacketType.EXTENDED_REPLY: return "EXTENDED_REPLY";
            default: return "" + packetType;
        }
    }
}

class SftpPacketReader extends SftpPacket {

    constructor(buffer: NodeBuffer) {
        super();

        this.buffer = buffer;
        this.position = 0;
        this.length = buffer.length;

        var length = this.readInt32() + 4;
        if (length != this.length)
            throw new Error("Invalid packet received");

        this.type = this.readByte();
        if (this.type == SftpPacketType.INIT || this.type == SftpPacketType.VERSION) {
            this.id = null;
        } else {
            this.id = this.readInt32();

            if (this.type == SftpPacketType.EXTENDED) {
                this.type = this.readString();
            }
        }
    }

    readByte(): number {
        this.check(1);
        var value = this.buffer[this.position++] & 0xFF;
        return value;
    }

    readInt32(): number {
        var value = this.readUint32();
        if (value & 0x80000000) value -= 0x100000000;
        // removed
        return value;
    }

    readUint32(): number {
        this.check(4);
        // removed
        var value = 0;
        value |= (this.buffer[this.position++] & 0xFF) << 24;
        value |= (this.buffer[this.position++] & 0xFF) << 16;
        value |= (this.buffer[this.position++] & 0xFF) << 8;
        value |= (this.buffer[this.position++] & 0xFF);
        return value;
    }

    readInt64(): number {
        var hi = this.readInt32();
        var lo = this.readUint32();

        var value = hi * 0x100000000 + lo;
        return value;
    }

    readString(): string {
        var length = this.readInt32();
        this.check(length);
        var end = this.position + length;
        var value = decodeUTF8(this.buffer, this.position, end);
        this.position = end;
        return value;
    }

    skipString(): void {
        var length = this.readInt32();
        this.check(length);

        var end = this.position + length;
        this.position = end;
    }

    readData(clone: boolean): NodeBuffer {
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
        } else {
            return view;
        }
    }

}

class SftpPacketWriter extends SftpPacket {

    constructor(length: number) {
        super();

        this.buffer = new Uint8Array(length);
        this.position = 0;
        this.length = length;
    }

    start(): void {
        this.position = 0;
        this.writeInt32(0); // length placeholder

        if (typeof this.type === "number") {
            this.writeByte(<number>this.type);
        } else {
            this.writeByte(<number>SftpPacketType.EXTENDED);
        }

        if (this.type == SftpPacketType.INIT || this.type == SftpPacketType.VERSION) {
            // these packets don't have an id
        } else {
            this.writeInt32(this.id | 0);

            if (typeof this.type !== "number") {
                this.writeString(<string>this.type);
            }
        }
    }

    finish(): NodeBuffer {
        var length = this.position;
        this.position = 0;
        this.writeInt32(length - 4);
        return this.buffer.subarray(0, length);
    }

    writeByte(value: number): void {
        this.check(1);
        this.buffer[this.position++] = value & 0xFF;
    }

    writeInt32(value: number): void {
        this.check(4);
        // removed
        // removed
        this.buffer[this.position++] = (value >> 24) & 0xFF;
        this.buffer[this.position++] = (value >> 16) & 0xFF;
        this.buffer[this.position++] = (value >> 8) & 0xFF;
        this.buffer[this.position++] = value & 0xFF;
    }

    writeInt64(value: number): void {
        var hi = (value / 0x100000000) | 0;
        var lo = (value & 0xFFFFFFFF) | 0;
        this.writeInt32(hi);
        this.writeInt32(lo);
    }

    writeString(value: string): void {
        if (typeof value !== "string") value = "" + value;
        var offset = this.position;
        this.writeInt32(0); // will get overwritten later

        var bytesWritten = encodeUTF8(value, this.buffer, this.position);
        if (bytesWritten < 0)
            throw new Error("Not enough space in the buffer");

        // write number of bytes and seek back to the end
        this.position = offset;
        this.writeInt32(bytesWritten);
        this.position += bytesWritten;
    }

    writeData(data: NodeBuffer, start?: number, end?: number): void {
        if (typeof start !== 'undefined')
            data = data.subarray(start, end);

        var length = data.length;
        this.writeInt32(length);

        this.check(length);
        this.buffer.set(data, this.position);
        this.position += length;
    }

}



class SftpFlags {

    static toNumber(flags: string): SftpOpenFlags {
        if (typeof flags === 'number')
            return (<SftpOpenFlags><any>flags) & SftpOpenFlags.ALL;

        switch (flags) {
            case 'r':
                return SftpOpenFlags.READ;
            case 'r+':
                return SftpOpenFlags.READ | SftpOpenFlags.WRITE;
            case 'w':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.TRUNC;
            case 'w+':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.TRUNC | SftpOpenFlags.READ;
            case 'wx':
            case 'xw':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.EXCL;
            case 'wx+':
            case 'xw+':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.EXCL | SftpOpenFlags.READ;
            case 'a':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.APPEND;
            case 'a+':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.APPEND | SftpOpenFlags.READ;
            case 'ax':
            case 'xa':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.APPEND | SftpOpenFlags.EXCL;
            case 'ax+':
            case 'xa+':
                return SftpOpenFlags.WRITE | SftpOpenFlags.CREATE | SftpOpenFlags.APPEND | SftpOpenFlags.EXCL | SftpOpenFlags.READ;
            default:
                throw Error("Invalid flags '" + flags + "'");
        }
    }

    static fromNumber(flags: number): string[]{
        flags &= SftpOpenFlags.ALL;

        // 'truncate' does not apply when creating a new file
        if ((flags & SftpOpenFlags.EXCL) != 0)
            flags &= SftpOpenFlags.ALL ^ SftpOpenFlags.TRUNC;

        // 'append' does not apply when truncating
        if ((flags & SftpOpenFlags.TRUNC) != 0)
            flags &= SftpOpenFlags.ALL ^ SftpOpenFlags.APPEND;

        // 'read' or 'write' must be specified (or both)
        if ((flags & (SftpOpenFlags.READ | SftpOpenFlags.WRITE)) == 0)
            flags |= SftpOpenFlags.READ;

        // when not creating a new file, only 'read' or 'write' applies
        // (and when creating a new file, 'write' is required)
        if ((flags & SftpOpenFlags.CREATE) == 0)
            flags &= SftpOpenFlags.READ | SftpOpenFlags.WRITE;
        else
            flags |= SftpOpenFlags.WRITE;

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
    }
}

class SftpExtensions {
    public static POSIX_RENAME = "posix-rename@openssh.com"; // "1"
    public static STATVFS = "statvfs@openssh.com"; // "2"
    public static FSTATVFS = "fstatvfs@openssh.com"; // "2"
    public static HARDLINK = "hardlink@openssh.com"; // "1"
    public static FSYNC = "fsync@openssh.com"; // "1"
    public static NEWLINE = "newline@sftp.ws"; // "\n"
    public static CHARSET = "charset@sftp.ws"; // "utf-8"

    private static _constructor = (() => {
        for (var name in SftpExtensions) {
            if (SftpExtensions.hasOwnProperty(name)) {
                SftpExtensions["_" + SftpExtensions[name]] = true;
            }
        }
    })();

    static isKnown(name: string): boolean {
        return SftpExtensions.hasOwnProperty("_" + name);
    }
}

class SftpStatus {


    static write(response: SftpPacketWriter, code: SftpStatusCode, message: string) {
        response.type = SftpPacketType.STATUS;
        response.start();

        response.writeInt32(code);
        response.writeString(message);
        response.writeInt32(0);
    }

    static writeSuccess(response: SftpPacketWriter) {
        this.write(response, SftpStatusCode.OK, "OK");
    }
}

class SftpOptions {
    encoding: string;
    handle: NodeBuffer;
    flags: string;
    mode: number;
    start: number;
    end: number;
    autoClose: boolean;
}

const enum SftpAttributeFlags {
    SIZE         = 0x00000001,
    UIDGID       = 0x00000002,
    PERMISSIONS  = 0x00000004,
    ACMODTIME    = 0x00000008,
    BASIC        = 0x0000000F,
    EXTENDED     = 0x80000000,
}

class SftpAttributes implements IStats {

    //uint32   flags
    //uint64   size           present only if flag SSH_FILEXFER_ATTR_SIZE
    //uint32   uid            present only if flag SSH_FILEXFER_ATTR_UIDGID
    //uint32   gid            present only if flag SSH_FILEXFER_ATTR_UIDGID
    //uint32   permissions    present only if flag SSH_FILEXFER_ATTR_PERMISSIONS
    //uint32   atime          present only if flag SSH_FILEXFER_ATTR_ACMODTIME
    //uint32   mtime          present only if flag SSH_FILEXFER_ATTR_ACMODTIME
    //uint32   extended_count present only if flag SSH_FILEXFER_ATTR_EXTENDED
    //string   extended_type
    //string   extended_data
    //...      more extended data(extended_type - extended_data pairs),
    //so that number of pairs equals extended_count

    flags: SftpAttributeFlags;
    size: number;
    uid: number;
    gid: number;
    mode: number;
    atime: Date;
    mtime: Date;
    nlink: number;

    isDirectory(): boolean {
        return (this.mode & FileType.ALL) == FileType.DIRECTORY;
    }

    isFile(): boolean {
        return (this.mode & FileType.ALL) == FileType.REGULAR_FILE;
    }

    isSymbolicLink(): boolean {
        return (this.mode & FileType.ALL) == FileType.SYMLINK;
    }

    constructor(reader?: SftpPacketReader) {
        if (typeof reader === 'undefined') {
            this.flags = 0;
            return;
        }

        var flags = this.flags = reader.readUint32();

        if (flags & SftpAttributeFlags.SIZE) {
            this.size = reader.readInt64();
        }

        if (flags & SftpAttributeFlags.UIDGID) {
            this.uid = reader.readInt32();
            this.gid = reader.readInt32();
        }

        if (flags & SftpAttributeFlags.PERMISSIONS) {
            this.mode = reader.readUint32();
        }

        if (flags & SftpAttributeFlags.ACMODTIME) {
            this.atime = new Date(1000 * reader.readUint32());
            this.mtime = new Date(1000 * reader.readUint32());
        }

        if (flags & SftpAttributeFlags.EXTENDED) {
            this.flags &= ~SftpAttributeFlags.EXTENDED;
            this.size = reader.readInt64();
            for (var i = 0; i < this.size; i++) {
                reader.skipString();
                reader.skipString();
            }
        }
    }

    write(response: SftpPacketWriter): void {
        var flags = this.flags;
        response.writeInt32(flags);

        if (flags & SftpAttributeFlags.SIZE) {
            response.writeInt64(this.size);
        }

        if (flags & SftpAttributeFlags.UIDGID) {
            response.writeInt32(this.uid);
            response.writeInt32(this.gid);
        }

        if (flags & SftpAttributeFlags.PERMISSIONS) {
            response.writeInt32(this.mode);
        }

        if (flags & SftpAttributeFlags.ACMODTIME) {
            response.writeInt32(this.atime.getTime() / 1000);
            response.writeInt32(this.mtime.getTime() / 1000);
        }

        if (flags & SftpAttributeFlags.EXTENDED) {
            response.writeInt32(0);
        }
    }

    from(stats: IStats): void {
        if (stats == null || typeof stats === 'undefined') {
            this.flags = 0;
        } else {
            var flags = 0;

            if (typeof stats.size !== 'undefined') {
                flags |= SftpAttributeFlags.SIZE;
                this.size = stats.size | 0;
            }

            if (typeof stats.uid !== 'undefined' || typeof stats.gid !== 'undefined') {
                flags |= SftpAttributeFlags.UIDGID;
                this.uid = stats.uid | 0;
                this.gid = stats.gid | 0;
            }

            if (typeof stats.mode !== 'undefined') {
                flags |= SftpAttributeFlags.PERMISSIONS;
                this.mode = stats.mode | 0;
            }

            if (typeof stats.atime !== 'undefined' || typeof stats.mtime !== 'undefined') {
                flags |= SftpAttributeFlags.ACMODTIME;
                this.atime = stats.atime; //TODO: make sure its Date
                this.mtime = stats.mtime; //TODO: make sure its Date
            }

            if (typeof (<any>stats).nlink !== 'undefined') {
                this.nlink = (<any>stats).nlink;
            }

            this.flags = flags;
        }
    }

}




interface SftpRequest {
    callback: Function;
    responseParser: (reply: SftpPacket, callback: Function) => void;
    info: SftpCommandInfo;
}

interface SftpResponse extends SftpPacketReader {
    info: SftpCommandInfo;
}

interface SftpCommandInfo extends Object {
    command: string;
    path?: string;
    handle?: any;
}

class SftpItem implements IItem {
    filename: string;
    longname: string;
    stats: SftpAttributes;
}

class SftpHandle {
    _handle: NodeBuffer;
    _this: SftpClientCore;

    constructor(handle: NodeBuffer, owner: SftpClientCore) {
        this._handle = handle;
        this._this = owner;
    }

    toString(): string {
        var value = "0x";
        for (var i = 0; i < this._handle.length; i++) {
            var b = this._handle[i];
            var c = b.toString(16);
            if (b < 16) value += "0";
            value += c;
        }
        return value;
    }
}

class SftpClientCore implements IFilesystem {

    private _host: IChannel
    private _id: number;
    private _requests: SftpRequest[];
    private _ready: boolean;
    private _extensions: Object;

    private _maxReadBlockLength: number;
    private _maxWriteBlockLength: number;

    private getRequest(type: SftpPacketType|string): SftpPacketWriter {
        var request = new SftpPacketWriter(this._maxWriteBlockLength + 1024);

        request.type = type;
        request.id = this._id;

        if (type == SftpPacketType.INIT) {
            if (this._id != null)
                throw new Error("Already initialized");
            this._id = 1;
        } else {
            this._id = (this._id + 1) & 0xFFFFFFFF;
        }

        request.start();
        return request;
    }

    private writeStats(packet: SftpPacketWriter, attrs?: IStats): void {
        var pattrs = new SftpAttributes();
        pattrs.from(attrs);
        pattrs.write(packet);
    }

    constructor() {
        this._host = null;
        this._id = null;
        this._ready = false;
        this._requests = [];
        this._extensions = {};

        this._maxWriteBlockLength = 32 * 1024;
        this._maxReadBlockLength = 256 * 1024;
    }

    private execute(request: SftpPacketWriter, callback: Function, responseParser: (response: SftpResponse, callback: Function) => void, info: SftpCommandInfo): void {
        if (typeof callback !== 'function') {
            // use dummy callback to prevent having to check this later
            callback = function (err) {
                if (err) throw err;
            };
        }

        if (!this._host) {
            process.nextTick(() => {
                var error = this.createError(SftpStatusCode.NO_CONNECTION, "Not connected", info);
                callback(error);
            });
            return;
        }

        if (typeof this._requests[request.id] !== 'undefined')
            throw new Error("Duplicate request");

        var packet = request.finish();
        this._host.send(packet);

        this._requests[request.id] = { callback: callback, responseParser: responseParser, info: info };
    }

    _init(host: IChannel, callback: (err: Error) => any): void {
        if (this._host) throw new Error("Already bound");

        this._host = host;
        this._extensions = {};

        var request = this.getRequest(SftpPacketType.INIT);

        request.writeInt32(3); // SFTPv3

        var info = { command: "init" };

        this.execute(request, callback,(response, cb) => {

            if (response.type != SftpPacketType.VERSION) {
                host.close(3002);
                var error = this.createError(SftpStatusCode.BAD_MESSAGE, "Unexpected message", info);
                return callback(new Error("Protocol violation"));
            }

            var version = response.readInt32();
            if (version != 3) {
                host.close(3002);
                var error = this.createError(SftpStatusCode.BAD_MESSAGE, "Unexpected protocol version", info);
                return callback(error);
            }

            while ((response.length - response.position) >= 4) {
                var extensionName = response.readString();
                var value: any;
                if (SftpExtensions.isKnown(extensionName)) {
                    value = response.readString();
                } else {
                    value = response.readData(true);
                }
                var values = <any[]>this._extensions[extensionName] || [];
                values.push(value);
                this._extensions[extensionName] = values;
            }

            this._ready = true;
            callback(null);
        }, info);
    }

    _process(packet: NodeBuffer): void {
        var response = <SftpResponse>new SftpPacketReader(packet);

        var request = this._requests[response.id];

        if (typeof request === 'undefined')
            throw new Error("Unknown response ID");

        delete this._requests[response.id];

        response.info = request.info;

        request.responseParser.call(this, response, request.callback);
    }

    _end(): void {
        var host = this._host;
        if (host) this._host = null;
        this.failRequests(SftpStatusCode.CONNECTION_LOST, "Connection lost");
    }

    end(): void {
        var host = this._host;
        if (host) {
            this._host = null;
            host.close();
        }
        this.failRequests(SftpStatusCode.CONNECTION_LOST, "Connection closed");
    }

    private failRequests(code: SftpStatusCode, message: string): void {
        var requests = this._requests;
        this._requests = [];
        
        requests.forEach(request => {
            var error = this.createError(code, message, request.info);
            request.callback(error);
        });
    }

    open(path: string, flags: string, attrs?: IStats, callback?: (err: Error, handle: any) => any): void {
        path = this.checkPath(path, 'path');

        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = <any>attrs;
            attrs = null;
        }

        var request = this.getRequest(SftpPacketType.OPEN);

        request.writeString(path);
        request.writeInt32(SftpFlags.toNumber(flags));
        this.writeStats(request, attrs);

        this.execute(request, callback, this.parseHandle, { command: "open", path: path });
    }

    close(handle: any, callback?: (err: Error) => any): void {
        var h = this.toHandle(handle);

        var request = this.getRequest(SftpPacketType.CLOSE);

        request.writeData(h);

        this.execute(request, callback, this.parseStatus, { command: "close", handle: handle });
    }

    read(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error, bytesRead: number, buffer: NodeBuffer) => any): void {
        var h = this.toHandle(handle);
        this.checkBuffer(buffer, offset, length);
        this.checkPosition(position);

        // make sure the length is within reasonable limits
        if (length > this._maxReadBlockLength)
            length = this._maxReadBlockLength;

        var request = this.getRequest(SftpPacketType.READ);
        
        request.writeData(h);
        request.writeInt64(position);
        request.writeInt32(length);

        this.execute(request, callback,(response, cb) => this.parseData(response, callback, 0, h, buffer, offset, length, position), { command: "read", handle: handle });
    }

    write(handle: any, buffer: NodeBuffer, offset: number, length: number, position: number, callback?: (err: Error) => any): void {
        var h = this.toHandle(handle);
        this.checkBuffer(buffer, offset, length);
        this.checkPosition(position);

        if (length > this._maxWriteBlockLength)
            throw new Error("Length exceeds maximum allowed data block length");

        var request = this.getRequest(SftpPacketType.WRITE);
        
        request.writeData(h);
        request.writeInt64(position);
        request.writeData(buffer, offset, offset + length);

        this.execute(request, callback, this.parseStatus, { command: "write", handle: handle });
    }

    lstat(path: string, callback?: (err: Error, attrs: IStats) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.LSTAT, [path], callback, this.parseAttribs, { command: "lstat", path: path });
    }

    fstat(handle: any, callback?: (err: Error, attrs: IStats) => any): void {
        var h = this.toHandle(handle);

        var request = this.getRequest(SftpPacketType.FSTAT);

        request.writeData(h);

        this.execute(request, callback, this.parseAttribs, { command: "fstat", handle: handle });
    }

    setstat(path: string, attrs: IStats, callback?: (err: Error) => any): void {
        path = this.checkPath(path, 'path');

        var request = this.getRequest(SftpPacketType.SETSTAT);

        request.writeString(path);
        this.writeStats(request, attrs);

        this.execute(request, callback, this.parseStatus, { command: "setstat", path: path });
    }

    fsetstat(handle: any, attrs: IStats, callback?: (err: Error) => any): void {
        var h = this.toHandle(handle);

        var request = this.getRequest(SftpPacketType.FSETSTAT);

        request.writeData(h);
        this.writeStats(request, attrs);

        this.execute(request, callback, this.parseStatus, { command: "fsetstat", handle: handle });
    }

    opendir(path: string, callback?: (err: Error, handle: any) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.OPENDIR, [path], callback, this.parseHandle, { command: "opendir", path: path });
    }

    readdir(handle: any, callback?: (err: Error, items: IItem[]|boolean) => any): void {
        var h = this.toHandle(handle);

        var request = this.getRequest(SftpPacketType.READDIR);

        request.writeData(h);

        this.execute(request, callback, this.parseItems, { command: "readdir", handle: handle });
    }

    unlink(path: string, callback?: (err: Error) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.REMOVE, [path], callback, this.parseStatus, { command: "unline", path: path });
    }

    mkdir(path: string, attrs?: IStats, callback?: (err: Error) => any): void {
        path = this.checkPath(path, 'path');
        if (typeof attrs === 'function' && typeof callback === 'undefined') {
            callback = <any>attrs;
            attrs = null;
        }

        var request = this.getRequest(SftpPacketType.MKDIR);

        request.writeString(path);
        this.writeStats(request, attrs);

        this.execute(request, callback, this.parseStatus, { command: "mkdir", path: path });
    }

    rmdir(path: string, callback?: (err: Error) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.RMDIR, [path], callback, this.parseStatus, { command: "rmdir", path: path });
    }

    realpath(path: string, callback?: (err: Error, resolvedPath: string) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.REALPATH, [path], callback, this.parsePath, { command: "realpath", path: path });
    }

    stat(path: string, callback?: (err: Error, attrs: IStats) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.STAT, [path], callback, this.parseAttribs, { command: "stat", path: path });
    }

    rename(oldPath: string, newPath: string, callback?: (err: Error) => any): void {
        oldPath = this.checkPath(oldPath, 'oldPath');
        newPath = this.checkPath(newPath, 'newPath');

        this.command(SftpPacketType.RENAME, [oldPath, newPath], callback, this.parseStatus, { command: "rename", oldPath: oldPath, newPath: newPath });
    }

    readlink(path: string, callback?: (err: Error, linkString: string) => any): void {
        path = this.checkPath(path, 'path');

        this.command(SftpPacketType.READLINK, [path], callback, this.parsePath, { command: "readlink", path: path });
    }

    symlink(targetPath: string, linkPath: string, callback?: (err: Error) => any): void {
        targetPath = this.checkPath(targetPath, 'targetPath');
        linkPath = this.checkPath(linkPath, 'linkPath');

        this.command(SftpPacketType.SYMLINK, [targetPath, linkPath], callback, this.parseStatus, { command: "symlink", targetPath: targetPath, linkPath: linkPath });
    }

    link(oldPath: string, newPath: string, callback?: (err: Error) => any): void {
        oldPath = this.checkPath(oldPath, 'oldPath');
        newPath = this.checkPath(newPath, 'newPath');

        this.command(SftpExtensions.HARDLINK, [oldPath, newPath], callback, this.parseStatus, { command: "link", oldPath: oldPath, newPath: newPath });
    }

    private toHandle(handle: { _handle: NodeBuffer; _this: SftpClientCore }): NodeBuffer {
        if (!handle) {
            throw new Error("Missing handle");
        } else if (typeof handle === 'object') {
            if (SftpPacket.isBuffer(handle._handle) && handle._this == this)
                return handle._handle;
        }

        throw new Error("Invalid handle");
    }

    private checkBuffer(buffer: NodeBuffer, offset: number, length: number): void {
        if (!SftpPacket.isBuffer(buffer))
            throw new Error("Invalid buffer");

        if (typeof offset !== 'number' || offset < 0)
            throw new Error("Invalid offset");

        if (typeof length !== 'number' || length < 0)
            throw new Error("Invalid length");

        if ((offset + length) > buffer.length)
            throw new Error("Offset or length is out of bands");
    }

    private checkPath(path: string, name: string): string {
        path = Path.check(path, name);
        if (path[0] === '~') {
            if (path[1] === '/') {
                path = "." + path.substr(1);
            } else if (path.length == 1) {
                path = ".";
            }
        }
        return path;
    }

    private checkPosition(position: number): void {
        if (typeof position !== 'number' || position < 0 || position > 0x7FFFFFFFFFFFFFFF)
            throw new Error("Invalid position");
    }

    private command(command: SftpPacketType|string, args: string[], callback: Function, responseParser: (response: SftpResponse, callback: Function) => void, info: SftpCommandInfo): void {
        var request = this.getRequest(command);

        for (var i = 0; i < args.length; i++) {
            request.writeString(args[i]);
        }

        this.execute(request, callback, responseParser, info);
    }

    private readStatus(response: SftpResponse): Error {
        var nativeCode = response.readInt32();
        var message = response.readString();
        if (nativeCode == SftpStatusCode.OK)
            return null;

        var info = response.info;
        return this.createError(nativeCode, message, info);
    }

    private readItem(response: SftpResponse): IItem {
        var item = new SftpItem();
        item.filename = response.readString();
        item.longname = response.readString();
        item.stats = new SftpAttributes(response);
        return item;
    }

    private createError(nativeCode: number, message: string, info: SftpCommandInfo) {
        var code;
        var errno;
        switch (nativeCode) {
            case SftpStatusCode.EOF:
                code = "EOF";
                errno = 1;
                break;
            case SftpStatusCode.NO_SUCH_FILE:
                code = "ENOENT";
                errno = 34;
                break;
            case SftpStatusCode.PERMISSION_DENIED:
                code = "EACCES";
                errno = 3;
                break;
            case SftpStatusCode.OK:
            case SftpStatusCode.FAILURE:
            case SftpStatusCode.BAD_MESSAGE:
                code = "EFAILURE";
                errno = -2;
                break;
            case SftpStatusCode.NO_CONNECTION:
                code = "ENOTCONN";
                errno = 31;
                break;
            case SftpStatusCode.CONNECTION_LOST:
                code = "ESHUTDOWN";
                errno = 46;
                break;
            case SftpStatusCode.OP_UNSUPPORTED:
                code = "ENOSYS";
                errno = 35;
                break;
            case SftpStatusCode.BAD_MESSAGE:
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
            if (name == "command") continue;
            if (info.hasOwnProperty(name)) error[name] = info[name];
        }

        error['nativeCode'] = nativeCode;
        error['description'] = message;
        return error;
    }

    private checkResponse(response: SftpResponse, expectedType: number, callback: Function): boolean {
        if (response.type == SftpPacketType.STATUS) {
            var error = this.readStatus(response);
            if (error != null) {
                callback(error);
                return false;
            }
        }

        if (response.type != expectedType)
            throw new Error("Unexpected packet received");

        return true;
    }

    private parseStatus(response: SftpResponse, callback?: (err: Error) => any): void {
        if (!this.checkResponse(response, SftpPacketType.STATUS, callback))
            return;

        callback(null);
    }

    private parseAttribs(response: SftpResponse, callback?: (err: Error, attrs: IStats) => any): void {
        if (!this.checkResponse(response, SftpPacketType.ATTRS, callback))
            return;

        var attrs = new SftpAttributes(response);
        delete attrs.flags;

        callback(null, attrs);
    }

    private parseHandle(response: SftpResponse, callback?: (err: Error, handle: any) => any): void {
        if (!this.checkResponse(response, SftpPacketType.HANDLE, callback))
            return;

        var handle = response.readData(true);

        callback(null, new SftpHandle(handle, this));
    }

    private parsePath(response: SftpResponse, callback?: (err: Error, path?: string) => any): void {
        if (!this.checkResponse(response, SftpPacketType.NAME, callback))
            return;

        var count = response.readInt32();
        if (count != 1)
            throw new Error("Invalid response");

        var path = response.readString();

        callback(null, path);
    }

    private parseData(response: SftpResponse, callback: (err: Error, bytesRead: number, buffer: NodeBuffer) => any, retries: number, h: NodeBuffer, buffer: NodeBuffer, offset: number, length: number, position: number): void {
        if (response.type == SftpPacketType.STATUS) {
            var error = this.readStatus(response);
            if (error != null) {
                if (error['nativeCode'] == SftpStatusCode.EOF)
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
                var error = this.createError(SftpStatusCode.FAILURE, "Unable to read data", response.info);
                error['code'] = "EIO";
                error['errno'] = 55;

                callback(error, 0, null);
                return;
            }

            var request = this.getRequest(SftpPacketType.READ);
            request.writeData(h);
            request.writeInt64(position);
            request.writeInt32(length);

            this.execute(request, callback,(response, cb) => this.parseData(response, callback, retries + 1, h, buffer, offset, length, position), response.info);
            return;
        }

        buffer.set(data, offset);

        callback(null, length, buffer);
    }

    private parseItems(response: SftpResponse, callback?: (err: Error, items: IItem[]|boolean) => any): void {

        if (response.type == SftpPacketType.STATUS) {
            var error = this.readStatus(response);
            if (error != null) {
                if (error['nativeCode'] == SftpStatusCode.EOF)
                    callback(null, false);
                else
                    callback(error, null);
                return;
            }
        }

        if (response.type != SftpPacketType.NAME)
            throw new Error("Unexpected packet received");

        var count = response.readInt32();

        var items: IItem[] = [];
        for (var i = 0; i < count; i++) {
            items[i] = this.readItem(response);
        }

        callback(null, items);
    }
}

interface ISftpClientEvents<T> {
    on(event: 'ready', listener: () => void): T;
    on(event: 'error', listener: (err: Error) => void): T;
    on(event: 'close', listener: (err: Error) => void): T;
    on(event: string, listener: Function): T;

    once(event: 'ready', listener: () => void): T;
    once(event: 'error', listener: (err: Error) => void): T;
    once(event: 'close', listener: (err: Error) => void): T;
    once(event: string, listener: Function): T;
}

class SftpClient extends FilesystemPlus {

    private _bound: boolean;

    constructor(local: IFilesystem) {
        var sftp = new SftpClientCore();
        super(sftp, local);
    }

    bind(channel: IChannel, callback?: (err: Error) => void): void {
        var sftp = <SftpClientCore>this._fs;

        if (this._bound) throw new Error("Already bound");
        this._bound = true;

        var ready = false;
        var self = this;

        channel.on("ready",() => {
            ready = true;
            sftp._init(channel, error => {
                if (error) {
                    sftp._end();
                    this._bound = false;
                    return done(error);
                }

                done(null);
                this.emit('ready');
            });
        });

        channel.on("message", packet => {
            try {
                sftp._process(packet);
            } catch (err) {
                this.emit("error", err);
                sftp.end();
            }
        });

        channel.on("error", err => {
            this.emit("error", err);
            sftp.end();
        });

        channel.on("close", err => {
            if (!ready) {
                err = err || new Error("Unable to connect");
                done(err);
            } else {
                sftp._end();
                this._bound = false;
                this.emit('close', err);
            }
        });

        function done(error: Error): void {
            if (typeof callback === "function") {
                try {
                    callback(error);
                    error = null;
                } catch (err) {
                    error = err;
                }
            }

            if (error) self.emit("error", error);
        }
    }

    end(): void {
        var sftp = <SftpClientCore>this._fs;
        sftp.end();
    }
}



interface IClientOptions {
    protocol?: string;
    log?: ILogWriter;
}

export class Client extends SftpClient implements ISftpClientEvents<Client> {

    on(event: string, listener: Function): Client {
        return <any>super.on(event, listener);
    }

    once(event: string, listener: Function): Client {
        return <any>super.on(event, listener);
    }

    constructor() {
        super(null);
    }

    connect(address: string, options?: IClientOptions, callback?: (err: Error) => void): void {
        options = options || {};

        if (typeof options.protocol == 'undefined') {
            options.protocol = 'sftp';
        }

        var protocols = [];
        if (typeof options !== 'object' || typeof options.protocol == 'undefined') {
            protocols.push('sftp');
        } else {
            protocols.push(options.protocol);
        }

        var ws = new WebSocket(address, protocols);
        ws.binaryType = "arraybuffer";

        var channel = new WebSocketChannel(ws);

        super.bind(channel, callback);
    }
}

}