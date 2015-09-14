var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var charsets = require("./charsets");
var encodeUTF8 = charsets.encodeUTF8;
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
        return Buffer.isBuffer(obj); //WEB: return obj && obj.buffer instanceof ArrayBuffer && typeof obj.byteLength !== "undefined";
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
exports.SftpPacket = SftpPacket;
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
        var value = this.buffer.readUInt8(this.position++, true); //WEB: var value = this.buffer[this.position++] & 0xFF;
        return value;
    };
    SftpPacketReader.prototype.readInt32 = function () {
        this.check(4); //WEB: var value = this.readUint32();
        var value = this.buffer.readInt32BE(this.position, true); //WEB: if (value & 0x80000000) value -= 0x100000000;
        this.position += 4; //WEB: // removed
        return value;
    };
    SftpPacketReader.prototype.readUint32 = function () {
        this.check(4);
        var value = this.buffer.readUInt32BE(this.position, true); //WEB: // removed
        this.position += 4; //WEB: var value = 0;
        //WEB: value |= (this.buffer[this.position++] & 0xFF) << 24;
        //WEB: value |= (this.buffer[this.position++] & 0xFF) << 16;
        //WEB: value |= (this.buffer[this.position++] & 0xFF) << 8;
        //WEB: value |= (this.buffer[this.position++] & 0xFF);
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
        var value = this.buffer.toString('utf8', this.position, end); //WEB: var value = decodeUTF8(this.buffer, this.position, end);
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
        //WEB: var view = this.buffer.subarray(start, end);
        if (clone) {
            var buffer = new Buffer(length); //WEB: var buffer = new Uint8Array(length);
            this.buffer.copy(buffer, 0, start, end); //WEB: buffer.set(view, 0);
            return buffer;
        }
        else {
            return this.buffer.slice(start, end); //WEB: return view;
        }
    };
    return SftpPacketReader;
})(SftpPacket);
exports.SftpPacketReader = SftpPacketReader;
var SftpPacketWriter = (function (_super) {
    __extends(SftpPacketWriter, _super);
    function SftpPacketWriter(length) {
        _super.call(this);
        this.buffer = new Buffer(length);
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
        this.buffer.writeInt32BE(length - 4, 0, true); //WEB: this.writeInt32(length - 4);
        return this.buffer.slice(0, length); //WEB: return this.buffer.subarray(0, length);
    };
    SftpPacketWriter.prototype.writeByte = function (value) {
        this.check(1);
        this.buffer.writeInt8(value, this.position++, true); //WEB: this.buffer[this.position++] = value & 0xFF;
    };
    SftpPacketWriter.prototype.writeInt32 = function (value) {
        this.check(4);
        this.buffer.writeInt32BE(value, this.position, true); //WEB: // removed
        this.position += 4; //WEB: // removed
        //WEB: this.buffer[this.position++] = (value >> 24) & 0xFF;
        //WEB: this.buffer[this.position++] = (value >> 16) & 0xFF;
        //WEB: this.buffer[this.position++] = (value >> 8) & 0xFF;
        //WEB: this.buffer[this.position++] = value & 0xFF;
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
            data = data.slice(start, end); //WEB: data = data.subarray(start, end);
        var length = data.length;
        this.writeInt32(length);
        this.check(length);
        data.copy(this.buffer, this.position, 0, length); //WEB: this.buffer.set(data, this.position);
        this.position += length;
    };
    return SftpPacketWriter;
})(SftpPacket);
exports.SftpPacketWriter = SftpPacketWriter;
