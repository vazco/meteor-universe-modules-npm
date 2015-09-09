var Browserify, checkFileChanges, checkFilename, envify, exorcist, handler, getBasedir,
    getBrowserifyOptions, getDebug, getFilesToCheck, getResult, getString, fs, stream,
    hasProp = {}.hasOwnProperty, JSONC, prepareSource, getModuleId, npm,
    indexOf = [].indexOf || function (item) {
            for (var i = 0, l = this.length; i < l; i++) {
                if (i in this && this[i] === item) return i;
            }
            return -1;
        };
Browserify = Npm.require('browserify');
envify = Npm.require('envify/custom');
exorcist = Npm.require('exorcist');
stream = Npm.require('stream');
JSONC = Npm.require('json-comments');
npm = Npm.require('npm');
fs = Npm.require('fs');
handler = function (step) {
    var browserify, browserifyOptions, bundle, e, envifyOptions, externalifyOptions,
        exorcisedBundle, mapFileName, ref, ref1, sourceMap, string, transformName, transformOptions;
    var uniNpmDir = step.fullInputPath.slice(0, -step.inputPath.length) + '.universe-npm/';
    if (!fs.existsSync(uniNpmDir)){
        fs.mkdirSync(uniNpmDir);
    }
    checkFilename(step);
    browserifyOptions = getBrowserifyOptions(step);
    browserify = Browserify([prepareSource(step)], browserifyOptions);
    envifyOptions = browserifyOptions.transforms.envify;
    delete browserifyOptions.transforms.envify;
    ref = browserifyOptions.transforms;
    for (transformName in ref) {
        if (!hasProp.call(ref, transformName)) continue;
        transformOptions = ref[transformName];
        browserify.transform(transformName, transformOptions);
    }
    browserify.transform(envify(envifyOptions));
    bundle = browserify.bundle();
    bundle.setEncoding('utf8');
    mapFileName = uniNpmDir+ step.inputPath + '.map';
    exorcisedBundle = bundle.pipe(exorcist(mapFileName, step.pathForSourceMap));
    exorcisedBundle.originalBundle = bundle;
    try {
        string = getResult(step, exorcisedBundle, browserifyOptions != null ? browserifyOptions.cache : void 0);
        sourceMap = fs.readFileSync(mapFileName, {
            encoding: 'utf8'
        });
        if ((browserifyOptions != null ? browserifyOptions.cache : void 0) === false) {
            fs.unlinkSync(mapFileName);
        }
        return step.addJavaScript({
            path: step.inputPath+'.js',
            sourcePath: step.inputPath,
            data: string,
            sourceMap: sourceMap,
            bare: step != null ? (ref1 = step.fileOptions) != null ? ref1.bare : void 0 : void 0
        });
    } catch (_error) {
        e = _error;
        return step.error({
            message: e.toString().substring(7),
            sourcePath: step.inputPath
        });
    }
};

Plugin.registerSourceHandler('import-npm.json', handler);

checkFileChanges = function (step, cacheFileName) {
    var cachedTime, file, i, len, modifiedTime, ref;
    if (!(fs.existsSync(cacheFileName) && fs.existsSync(step.fullInputPath + '.map'))) {
        return true;
    }
    cachedTime = fs.statSync(cacheFileName).mtime.getTime();
    ref = getFilesToCheck(step);
    for (i = 0, len = ref.length; i < len; i++) {
        file = ref[i];
        if (fs.existsSync(file)) {
            modifiedTime = fs.statSync(file).mtime.getTime();
            if (cachedTime < modifiedTime) {
                return true;
            }
        }
    }
    return false;
};

checkFilename = function (step) {
    if (step.inputPath === 'import-npm.json') {
        return console.log('WARNING: using \'import-npm.json\' as full filename may stop working.' + ' See Meteor Issue #3985. Please add something before it like: packages.import-npm.json');
    }
};

getBasedir = function (step) {
    var basedir, tail;
    //tail = (step != null ? step.packageName : void 0) != null ? '.npm/package' : 'packages/npm-container/.npm/package';
    tail = (step != null ? step.packageName : void 0) != null ? '.universe-npm/node_modules' : '.universe-npm/node_modules';
    basedir = step.fullInputPath.slice(0, -step.inputPath.length) + tail;
    return basedir;
};

getBrowserifyOptions = function (step) {
    var defaultOptions, e, optionsFileName, ref, userOptions;
    userOptions = {};
    optionsFileName = step.fullInputPath.slice(0, -2) + 'browserify.options.json';
    if (fs.existsSync(optionsFileName)) {
        try {
            userOptions = JSON.parse(fs.readFileSync(optionsFileName, 'utf8'));
        } catch (_error) {
            e = _error;
            step.error({
                message: 'Couldn\'t read JSON data: ' + e.toString(),
                sourcePath: step.inputPath
            });
        }
    }
    defaultOptions = {
        basedir: getBasedir(step),
        debug: true,
        transforms: {
            envify: {
                NODE_ENV: getDebug() ? 'development' : 'production',
                _: 'purge'
            }
        }
    };
    _.defaults(userOptions, defaultOptions);
    if ((ref = userOptions.transforms) != null) {
        if (ref.envify == null) {
            ref.envify = defaultOptions.transforms.envify;
        }
    }
    return userOptions;
};

getDebug = function () {
    var debug, i, key, len, ref;
    debug = true;
    ref = process.argv;
    for (i = 0, len = ref.length; i < len; i++) {
        key = ref[i];
        if (key === 'bundle' || key === 'build') {
            debug = indexOf.call(process.argv, '--debug') >= 0;
            break;
        }
    }
    return debug;
};

getFilesToCheck = function (step) {
    return [step.fullInputPath, getBasedir(step) + '/browserify.options.json', getBasedir(step) + '/.universe-npm'];
};

prepareSource = function (step) {
    var config = JSONC.parse(step.read().toString('utf8'));
    var source = '';
    if (config) {
        _.each(config, function (version, packageName) {
            source += '_export("' + packageName + '", require("' + packageName + '"));\n';
        });
        installPackages(step, config);
    }
    var result = 'System.register("' + getModuleId(step) + '", [], function (_export) {' +
        'return {' +
        'setters: [],' +
        'execute: function () {\n' +
        source +
        '}};});';
    var readable;
    readable = new stream.PassThrough();
    readable.end(result);
    return readable;
};

getModuleId = function (step) {
    var moduleId = step.inputPath.replace('.import-npm.json', '');
    if (process.platform === 'win32') {
        // windows support, replace backslashes with forward slashes
        moduleId = moduleId.replace(/\\/g, '/');
    }
    if (step.packageName) {
        if (moduleId) {
            moduleId = '/' + moduleId;
        }
        // inside package, prefix module
        moduleId = '{' + step.packageName + '}' + moduleId;
    }
    return moduleId + '!npm';
};

getResult = function (step, bundle, useCache) {
    var cacheFileName, cacheFileStream, compileChanges, string;
    if (useCache == null) {
        useCache = true;
    }
    if (useCache) {
        var uniNpmDir = step.fullInputPath.slice(0, -step.inputPath.length) + '.universe-npm/';
        cacheFileName = uniNpmDir+ step.inputPath + '.cached';
        compileChanges = checkFileChanges(step, cacheFileName);
        if (compileChanges) {
            cacheFileStream = fs.createWriteStream(cacheFileName, {
                flags: 'w',
                encoding: 'utf8'
            });
            bundle.pipe(cacheFileStream);
            string = getString(bundle);
        } else {
            string = fs.readFileSync(cacheFileName, {
                encoding: 'utf8'
            });
        }
    } else {
        string = getString(bundle);
    }
    return string;
};

getString = Meteor.wrapAsync(function (bundle, cb) {
    var string;
    string = '';
    bundle.on('data', function (data) {
        return string += data;
    });
    bundle.once('end', function () {
        return cb(void 0, string);
    });
    return bundle.originalBundle.once('error', function (error) {
        return cb(error);
    });
});

var installPackages = Meteor.wrapAsync(function (step, packageList, cb) {
    var basedir = step.fullInputPath.slice(0, -step.inputPath.length) + '.universe-npm';
    var packages = _.chain(packageList).map(function(version, packageName){
        if (fs.existsSync(basedir+'/node_modules/'+packageName)){
            return;
        }
        return packageName+'@'+version;
    }).compact().value();

    if(!packages || !packages.length){
        return cb();
    }
    npm.load(function(err){
        if (err) {
            return console.error(err.message);
        }
        npm.commands.install(basedir, packages, cb);
    });
});