var misc = require("./fs-misc");
var FileUtil = misc.FileUtil;
var Path = misc.Path;
function search(fs, path, emitter, options, callback) {
    if (path.length == 0)
        throw new Error("Empty path");
    // use dummy emitter if not specified
    if (!emitter)
        emitter = {
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
    if (!matchFiles && !matchDirectories)
        throw new Error("Not matching anything with the specified options");
    // on windows, normalize backslashes
    var windows = fs.isWindows == true;
    path = new Path(path, null).normalize().path;
    // append a wildcard to slash-ended paths, or make sure they refer to a directory
    if (path[path.length - 1] == '/') {
        if (expandDir) {
            path += "*";
        }
        else {
            path = path.substr(0, path.length - 1);
            expectDir = true;
        }
    }
    // resulting item list
    var results = [];
    // important variables
    var basePath;
    var glob;
    var queue = [];
    var patterns = [];
    // search for the first wildcard
    var w1 = path.indexOf('*');
    var w2 = path.indexOf('?');
    var w = (w1 < 0) ? w2 : (w2 < 0) ? w1 : w2;
    if (w >= 0) {
        // wildcard present -> split the path into base path and mask
        if (options.nowildcard || options.itemonly)
            throw new Error("Wildcards not allowed");
        if (options.listonly) {
            var s = path.indexOf('/', w);
            if (s > w)
                throw new Error("Wildcards only allowed in the last path segment");
        }
        w = path.lastIndexOf('/', w);
        var mask = path.substr(w + 1);
        if (w >= 0) {
            path = path.substr(0, w);
        }
        else {
            path = ".";
        }
        // start matching
        start(path, mask);
    }
    else {
        // no wildcards -> determine whether this is a file or directory
        fs.stat(path, function (err, stats) {
            if (err)
                return callback(err, null);
            try {
                if (!options.itemonly) {
                    if (FileUtil.isDirectory(stats)) {
                        // if it's a directory, start matching
                        if (expandDir)
                            return start(path, "*");
                    }
                    else {
                        if (expectDir)
                            return callback(new Error("The specified path is not a directory"), null);
                        if (!FileUtil.isFile(stats)) {
                            // if it's not a file, we are done
                            return callback(null, results);
                        }
                    }
                }
                // determine item name
                w = path.lastIndexOf('/');
                var name;
                if (w < 0) {
                    name = path;
                    path = "./" + name;
                }
                else {
                    name = path.substr(w + 1);
                }
                // push item to the results
                var item = { filename: name, stats: stats, path: path, relativePath: name };
                results.push(item);
                emitter.emit("item", item);
                return callback(null, results);
            }
            catch (err) {
                return callback(err, null);
            }
        });
    }
    return;
    // prepare and start the matching
    function start(path, mask) {
        // construct base path
        if (path.length == 0 || (windows && path.length == 2 && path[1] == ':'))
            path += "/";
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
                }
                else if (mask[gs + 3] == '/') {
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
                results.sort(function (a, b) {
                    if (a.relativePath < b.relativePath)
                        return -1;
                    if (a.relativePath > b.relativePath)
                        return 1;
                    return 0;
                });
            }
            return callback(null, results);
        }
        var relativePath;
        var index;
        var regex;
        var depth;
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
            }
            else {
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
            fs.opendir(fullPath, function (err, handle) {
                if (err)
                    return callback(err, null);
                emitter.emit("traversing", fullPath);
                // send 1 read request
                var error = null;
                var requests = 1;
                fs.readdir(handle, read);
                function read(err, items) {
                    try {
                        requests--;
                        error = error || err;
                        if (error || !items) {
                            if (requests > 0)
                                return;
                            // when done, close the handle
                            fs.close(handle, function (err) {
                                error = error || err;
                                if (err)
                                    return callback(error, null);
                                emitter.emit("traversed", fullPath);
                                // process next directory
                                next();
                            });
                            return;
                        }
                        // process items
                        items.forEach(process);
                        // read next items using several parallel readdir requests
                        while (requests < 2) {
                            fs.readdir(handle, read);
                            requests++;
                        }
                    }
                    catch (err) {
                        error = error || err;
                        return callback(error, null);
                    }
                }
            });
        }
        catch (err) {
            return callback(err, null);
        }
        // process a single item
        function process(item) {
            var isDir = FileUtil.isDirectory(item.stats);
            var isFile = FileUtil.isFile(item.stats);
            var isDotDir = (item.filename == "." || item.filename == "..");
            if (isDotDir && !matchDotDirs)
                return;
            if (!isDir && !isFile)
                return;
            var itemPath = relativePath.join(item.filename);
            // add subdirectory to queue if desired
            if (enterDirs && isDir && !isDotDir) {
                queue.push({ path: itemPath, pattern: nextIndex, depth: depth });
            }
            // if not matching items in this directory, we are done with it
            if (!matchItems)
                return;
            // reject items we don't want
            if (isDir && !matchDirectories)
                return;
            if (isFile && !matchFiles)
                return;
            if (regex) {
                // mask matching
                if (!regex.test(item.filename))
                    return;
            }
            else {
                // globstar matching
                if (!glob.test(itemPath.path))
                    return;
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
    function toRegExp(mask, globstar) {
        var pattern = "^";
        if (globstar)
            pattern += ".*";
        for (var i = 0; i < mask.length; i++) {
            var c = mask[i];
            switch (c) {
                case '/':
                    var gm = mask.substr(i, 4);
                    if (gm == "/**/" || gm == "/**") {
                        pattern += ".*";
                        i += 3;
                    }
                    else {
                        pattern += '/';
                    }
                    break;
                case '*':
                    if (globstar) {
                        pattern += "[^/]*";
                    }
                    else {
                        pattern += ".*";
                    }
                    break;
                case '?':
                    pattern += ".";
                    break;
                default:
                    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
                        pattern += c;
                    }
                    else {
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
exports.search = search;
