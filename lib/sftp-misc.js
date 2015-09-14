var SftpFlags = (function () {
    function SftpFlags() {
    }
    SftpFlags.toNumber = function (flags) {
        if (typeof flags === 'number')
            return flags & 63 /* ALL */;
        switch (flags) {
            case 'r':
                return 1 /* READ */;
            case 'r+':
                return 1 /* READ */ | 2 /* WRITE */;
            case 'w':
                return 2 /* WRITE */ | 8 /* CREATE */ | 16 /* TRUNC */;
            case 'w+':
                return 2 /* WRITE */ | 8 /* CREATE */ | 16 /* TRUNC */ | 1 /* READ */;
            case 'wx':
            case 'xw':
                return 2 /* WRITE */ | 8 /* CREATE */ | 32 /* EXCL */;
            case 'wx+':
            case 'xw+':
                return 2 /* WRITE */ | 8 /* CREATE */ | 32 /* EXCL */ | 1 /* READ */;
            case 'a':
                return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */;
            case 'a+':
                return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 1 /* READ */;
            case 'ax':
            case 'xa':
                return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 32 /* EXCL */;
            case 'ax+':
            case 'xa+':
                return 2 /* WRITE */ | 8 /* CREATE */ | 4 /* APPEND */ | 32 /* EXCL */ | 1 /* READ */;
            default:
                throw Error("Invalid flags '" + flags + "'");
        }
    };
    SftpFlags.fromNumber = function (flags) {
        flags &= 63 /* ALL */;
        // 'truncate' does not apply when creating a new file
        if ((flags & 32 /* EXCL */) != 0)
            flags &= 63 /* ALL */ ^ 16 /* TRUNC */;
        // 'append' does not apply when truncating
        if ((flags & 16 /* TRUNC */) != 0)
            flags &= 63 /* ALL */ ^ 4 /* APPEND */;
        // 'read' or 'write' must be specified (or both)
        if ((flags & (1 /* READ */ | 2 /* WRITE */)) == 0)
            flags |= 1 /* READ */;
        // when not creating a new file, only 'read' or 'write' applies
        // (and when creating a new file, 'write' is required)
        if ((flags & 8 /* CREATE */) == 0)
            flags &= 1 /* READ */ | 2 /* WRITE */;
        else
            flags |= 2 /* WRITE */;
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
    };
    return SftpFlags;
})();
exports.SftpFlags = SftpFlags;
var SftpExtensions = (function () {
    function SftpExtensions() {
    }
    SftpExtensions.isKnown = function (name) {
        return SftpExtensions.hasOwnProperty("_" + name);
    };
    SftpExtensions.POSIX_RENAME = "posix-rename@openssh.com"; // "1"
    SftpExtensions.STATVFS = "statvfs@openssh.com"; // "2"
    SftpExtensions.FSTATVFS = "fstatvfs@openssh.com"; // "2"
    SftpExtensions.HARDLINK = "hardlink@openssh.com"; // "1"
    SftpExtensions.FSYNC = "fsync@openssh.com"; // "1"
    SftpExtensions.NEWLINE = "newline@sftp.ws"; // "\n"
    SftpExtensions.CHARSET = "charset@sftp.ws"; // "utf-8"
    SftpExtensions._constructor = (function () {
        for (var name in SftpExtensions) {
            if (SftpExtensions.hasOwnProperty(name)) {
                SftpExtensions["_" + SftpExtensions[name]] = true;
            }
        }
    })();
    return SftpExtensions;
})();
exports.SftpExtensions = SftpExtensions;
var SftpStatus = (function () {
    function SftpStatus() {
    }
    SftpStatus.write = function (response, code, message) {
        response.type = 101 /* STATUS */;
        response.start();
        response.writeInt32(code);
        response.writeString(message);
        response.writeInt32(0);
    };
    SftpStatus.writeSuccess = function (response) {
        this.write(response, 0 /* OK */, "OK");
    };
    return SftpStatus;
})();
exports.SftpStatus = SftpStatus;
var SftpOptions = (function () {
    function SftpOptions() {
    }
    return SftpOptions;
})();
exports.SftpOptions = SftpOptions;
var SftpAttributes = (function () {
    function SftpAttributes(reader) {
        if (typeof reader === 'undefined') {
            this.flags = 0;
            return;
        }
        var flags = this.flags = reader.readUint32();
        if (flags & 1 /* SIZE */) {
            this.size = reader.readInt64();
        }
        if (flags & 2 /* UIDGID */) {
            this.uid = reader.readInt32();
            this.gid = reader.readInt32();
        }
        if (flags & 4 /* PERMISSIONS */) {
            this.mode = reader.readUint32();
        }
        if (flags & 8 /* ACMODTIME */) {
            this.atime = new Date(1000 * reader.readUint32());
            this.mtime = new Date(1000 * reader.readUint32());
        }
        if (flags & 2147483648 /* EXTENDED */) {
            this.flags &= ~2147483648 /* EXTENDED */;
            this.size = reader.readInt64();
            for (var i = 0; i < this.size; i++) {
                reader.skipString();
                reader.skipString();
            }
        }
    }
    SftpAttributes.prototype.isDirectory = function () {
        return (this.mode & 61440 /* ALL */) == 16384 /* DIRECTORY */;
    };
    SftpAttributes.prototype.isFile = function () {
        return (this.mode & 61440 /* ALL */) == 32768 /* REGULAR_FILE */;
    };
    SftpAttributes.prototype.isSymbolicLink = function () {
        return (this.mode & 61440 /* ALL */) == 40960 /* SYMLINK */;
    };
    SftpAttributes.prototype.write = function (response) {
        var flags = this.flags;
        response.writeInt32(flags);
        if (flags & 1 /* SIZE */) {
            response.writeInt64(this.size);
        }
        if (flags & 2 /* UIDGID */) {
            response.writeInt32(this.uid);
            response.writeInt32(this.gid);
        }
        if (flags & 4 /* PERMISSIONS */) {
            response.writeInt32(this.mode);
        }
        if (flags & 8 /* ACMODTIME */) {
            response.writeInt32(this.atime.getTime() / 1000);
            response.writeInt32(this.mtime.getTime() / 1000);
        }
        if (flags & 2147483648 /* EXTENDED */) {
            response.writeInt32(0);
        }
    };
    SftpAttributes.prototype.from = function (stats) {
        if (stats == null || typeof stats === 'undefined') {
            this.flags = 0;
        }
        else {
            var flags = 0;
            if (typeof stats.size !== 'undefined') {
                flags |= 1 /* SIZE */;
                this.size = stats.size | 0;
            }
            if (typeof stats.uid !== 'undefined' || typeof stats.gid !== 'undefined') {
                flags |= 2 /* UIDGID */;
                this.uid = stats.uid | 0;
                this.gid = stats.gid | 0;
            }
            if (typeof stats.mode !== 'undefined') {
                flags |= 4 /* PERMISSIONS */;
                this.mode = stats.mode | 0;
            }
            if (typeof stats.atime !== 'undefined' || typeof stats.mtime !== 'undefined') {
                flags |= 8 /* ACMODTIME */;
                this.atime = stats.atime; //TODO: make sure its Date
                this.mtime = stats.mtime; //TODO: make sure its Date
            }
            if (typeof stats.nlink !== 'undefined') {
                this.nlink = stats.nlink;
            }
            this.flags = flags;
        }
    };
    return SftpAttributes;
})();
exports.SftpAttributes = SftpAttributes;
