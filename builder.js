const Browserify = Npm.require('browserify');
const stream = Npm.require('stream');
const stripJsonComments = Npm.require('strip-json-comments');
const npm = Npm.require('npm');
const os = Npm.require('os');
const camelCase = Npm.require('camelcase');
const {fs, path} = Plugin;

function logPoint(...args) {
    const str = `${Date.now()}=> ${args.join(' ')}\r\n`;
    console.log(str);
    process.stdout.write(str);
    fs.appendFileSync('/var/www/html/tom/testlog.fuck', str, 'utf8');
}
const getString = Meteor.wrapAsync((bundle, cb) => {
    let string = '';
    bundle.on('data', (data) => string += data);
    bundle.once('end', () => cb(void 0, string));
    return bundle.once('error', cb);
});

logPoint('log point defined?');

class UniverseModulesNPMBuilder extends CachingCompiler {
    constructor() {
        super({
            compilerName: 'UniverseModulesNPMBuilder',
            defaultCacheSize: 1024 * 1024 * 10
        });
    }

    getCacheKey(file) {
        const cacheKey = file.getSourceHash() + file.getPathInPackage() + JSON.stringify(file.getFileOptions());
        logPoint(cacheKey);
        return cacheKey;
    }

    compileResultSize(compileResult) {
        return compileResult.length * 2;
    }

    getBasedir(file) {
        const basedir = path.resolve(Plugin.convertToStandardPath(os.tmpdir()), 'universe-npm');
        const fulldir = path.resolve(basedir, (file.getPackageName() || '' + file.getPathInPackage()).replace(/[^a-zA-Z0-9\-]/g, '_'));
        logPoint('log point defined?', fulldir, basedir);
        return fulldir;
    }

    addCompileResult(file, compileResult) {
        return file.addJavaScript({
            path: file.getPathInPackage() + '.js',
            sourcePath: file.getPathInPackage(),
            data: compileResult
        });
    }

    excludeFromBundle(browserify, systemDependencies, system) {
        system._bundleIndexes = {};
        const  _reg = /(.*)\.[^.]+$/;
        if (Array.isArray(systemDependencies)) {
            systemDependencies.forEach(toImport => {
                browserify.exclude(toImport);
            });
            systemDependencies._deps = {};
            browserify.on('dep', row => {
                const file = Plugin.convertToStandardPath(row.file);
                const moduleName = (file.split('/node_modules/')).pop();
                if (!systemDependencies.some(toImport => {
                        return moduleName.indexOf(toImport + '/') === 0;
                    })) {
                    Object.keys(row.deps).forEach(dep => {
                        systemDependencies.some(toImport => {
                            if (dep.indexOf(toImport + '/') === 0) {
                                systemDependencies._deps[dep] = true;
                            }
                        });
                    });
                    system._bundleIndexes[moduleName.replace(_reg, '$1')] = row.id;
                }
            });
        } else {
            browserify.on('dep', row => {
                const file = Plugin.convertToStandardPath(row.file);
                const moduleName = (file.split('/node_modules/')).pop();
                system._bundleIndexes[moduleName.replace(_reg, '$1')] = row.id;
            });
        }
    }

    configureSystem(sysConfig) {
        if (typeof sysConfig === 'object' && Object.keys(sysConfig).length) {
            return `System.config(${JSON.stringify(sysConfig)});`;
        }
        return '';
    }

    compileOneFile(file) {
        const sourcePath = file.getPackageName() + '/' + file.getPathInPackage();
        Plugin.nudge && Plugin.nudge();
        logPoint('Universe NPM: ' + sourcePath);
        try {
            const {source, config, moduleId, modulesToExport} = this.prepareSource(file);
            const optionsForBrowserify = this.getBrowserifyOptions(file, config.browserify);
            const browserify = Browserify([source], optionsForBrowserify); // eslint-disable-line new-cap
            config.system = config.system || {};
            this.excludeFromBundle(browserify, config.system.dependencies, config.system);
            this.applyTransforms(browserify, optionsForBrowserify);
            const bundle = browserify.bundle();
            bundle.setEncoding('utf8');
            return this.getCompileResult(bundle, config.system, moduleId, modulesToExport);
        } catch (_error) {
            logPoint('error in compileOnFile ' + JSON.stringify({
                message: _error.message,
                sourcePath
            }));
            file.error({
                message: _error.message,
                sourcePath
            });
        }
    }

    applyTransforms(browserify, browserifyOptions) {
        /*let envifyOptions = {}; // uggh this typechecking is so ugly. I MISS lodash! but im not going to tack on another derp because I intend to PR this
        if (browserifyOptions && _.has(browserifyOptions, 'transforms')) {
            if (_.isObject(browserify.transforms) && _.has(browserify.transforms, 'envify')) {
                envifyOptions = browserifyOptions.transforms.envify;
                browserifyOptions.transforms = _.omit(browserifyOptions.transforms, 'envify');
            }
        }*/
        logPoint(browserifyOptions);
        _.forEach(browserifyOptions.transforms, (transformOptions, transformName) => {
            browserify.transform(transformName, transformOptions);
        });
        //browserify.transform(envify(envifyOptions));
    }

    getCompileResult(bundle, {dependencies, config, _bundleIndexes}, moduleId, modulesToExport = '') {
        const source = getString(bundle);
        if (!Array.isArray(dependencies)) {
            dependencies = [];
        }
        // adding important system deps
        if (dependencies._deps) {
            dependencies.push(...(Object.keys(dependencies._deps)));
        }
        const depPromisesStr = dependencies.map(dep =>`"${dep}"`).join(',') || '';
        return (
            `
var _uniBundleMapIndexes = ${JSON.stringify(_bundleIndexes)};
${this.configureSystem(config)}
System.registerDynamic("${moduleId}", [${depPromisesStr}], true, function(_uniSysRequire, _uniSysExports, _uniSysModule) {

var require = function(){
    return (function e(def, n, r) {
        function bundleLoader(id, u) {
            if (!n[id]) {
                if (!def[id]) {
                    var a = typeof require == "function" && require;
                    if(!u && a)return a(id, !0);
                    var systemModule = _uniSysRequire(id);
                    if(!systemModule){
                        var err = new Error("Cannot find module '" + id + "'");
                        err.code = "MODULE_NOT_FOUND";
                        throw err;
                    }
                    return systemModule;
                }
                var module = n[id] = {exports: {}};
                def[id][0].call(module.exports, function bundleRequire(name) {
                    var n = def[id][1][name];
                    return bundleLoader(n ? n : name);
                }, module, module.exports, e, def, n, r)
            }
            return n[id].exports;
        }

        for (var o = 0; o < r.length; o++)bundleLoader(r[o]);
        return bundleLoader;
    });
}
/*Sources*/
${source}
});
${modulesToExport}
`);
    }

    getBrowserifyOptions(file, userOptions) {
        userOptions = userOptions || {};
        let defaultOptions;
        const transform = userOptions.transforms;
        const transforms = {
           /* envify: {
                NODE_ENV: this.getDebug() ? 'development' : 'production',
                _: 'purge'
            }*/
        };
        defaultOptions = {
            basedir: Plugin.convertToOSPath(this.getBasedir(file)),
            debug: true,
            ignoreMissing: true,
            transforms
        };
        _.defaults(userOptions, defaultOptions);
        if (transform !== null) {
            /*if (transform.envify === null) {
                transform.envify = defaultOptions.transforms.envify;
            }*/
        }
        return userOptions;
    }

    getDebug() {
        let debug, key, _i, _len, _ref1; // eslint-disable-line one-var
        debug = true;
        _ref1 = process.argv;
        for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            key = _ref1[_i];
            if (key === 'bundle' || key === 'build') {
                debug = __indexOf.call(process.argv, '--debug') >= 0;
                break;
            }
        }
        return debug;
    }

    prepareSource(file) {
        const source = new stream.PassThrough();
        const config = JSON.parse(stripJsonComments(file.getContentsAsString()));
        const moduleId = this.getModuleId(file);
        let lines = '';
        let modulesToExport = '';
        config.packages = config.packages || config.dependencies;
        if (config && config.packages) {
            _.each(config.packages, (version, packageName) => {
                const camelCasePkgName = camelCase(packageName);
                lines += (
                    `    _uniSysModule.exports["${camelCasePkgName}"] = require('${packageName}');
`
                );
            });
            lines += (
                `    _uniSysModule.exports._bundleRequire = function(pkgName){
            var index = _uniBundleMapIndexes[pkgName];
            if(index){
                return require(index);
            }
            return require(pkgName);
     };
`
            );
            installPackages(this.getBasedir(file), file, config.packages);
            const loaderName = (camelCase((file.getPackageName() || '') + '_' + file.getPathInPackage())).replace(/[:\/\\]/g, '_');
            modulesToExport = (
                `
System.config({
    meta: {
        '${moduleId}/*': {
            format: 'register',
            loader: 'UniverseDynamicLoader_${loaderName}'
        }
    }
});

var UniverseDynamicLoader_${loaderName} = System.newModule({
    locate: function locate(params) {
        var name = params.name;
        var metadata = params.metadata;
        return new Promise(function(resolve, reject) {
            var names = name.split('${moduleId}/');
            metadata.submoduleName = names[1];
            // check if we're in valid namespace
            if (names[0] || !metadata.submoduleName) {
                reject(new Error('[Universe Modules NPM]: trying to get exported values from invalid package: ' + name));
                return;
            }
            resolve(name);
        });
    },
    fetch: function fetch () {
        // we don't need to fetch anything for this to work
        return '';
    },
    instantiate: function instantiate (params) {
        var metadata = params.metadata;
        return System.import("${moduleId}").then(function(_um) {
            return _um._bundleRequire(metadata.submoduleName);
        });
    }
});
// Register our loader
System.set('UniverseDynamicLoader_${loaderName}', UniverseDynamicLoader_${loaderName});
`
            );
        }
        source.end(lines);
        return {source, config, moduleId, modulesToExport};
    }

    getModuleId(file) {
        // Relative path of file to the package or app root directory (always uses forward slashes)
        const filePath = file.getPathInPackage();

        // Options from api.addFile
        //const fileOptions = file.getFileOptions();

        // Name of the package or null if the file is not in a package.
        const packageName = file.getPackageName();

        // moduleId - Module name (full patch without extension)
        // ext - File extension (either js or jsx)
        let moduleId = filePath.replace(/\.npm\.json$/, '');

        // prefix module name accordingly
        if (packageName) {
            // inside package
            moduleId = '/_modules_/packages/' + packageName.replace(':', '/') + '/' + moduleId;
        } else {
            // inside main app
            moduleId = '/_modules_/app/' + moduleId;
        }
        return moduleId;
    }
}

const ensureDepsInstalled = Meteor.wrapAsync((basedir, packages, cb) => {
    logPoint('Installing npm packages: ' + packages.join(', ') + '\r\n');
    npm.load((err) => {
        err && cb(err);
        npm.commands.install(Plugin.convertToOSPath(basedir), packages, cb);
    });
});

function deleteFolderRecursive(path) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach((file) => {
            const curPath = `${path}/${file}`;
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(path);
    }
}

function savePackageJsnFile(pgName, basedir) {
    const data = (
        `{
  "name": "${pgName.replace(/[^a-z]/g, '-')}",
  "version": "9.9.9",
  "description": "This is stamp only",
  "license": "UNLICENSED",
  "private": true
}`
    );
    fs.writeFile(path.resolve(basedir, 'package.json'), data, 'utf8', ()=>{});
}

function installPackages(basedir, file, packageList) {
    const packages = [];
    let installedCount = 0;
    _(packageList).map((version, packageName) => {
        if (typeof version === 'object') {
            version = version.version;
        }
        if (!version) {
            file.error({
                message: 'Missing version of npm package: ' + packageName,
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });

            logPoint({
                message: 'Missing version of npm package: ' + packageName,
                sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
            });
            return;
        }
        const fullPkgName = packageName + '@' + version;
        const pgPath = path.resolve(basedir, 'node_modules', packageName);
        if (fs.existsSync(pgPath)) {
            try {

                const targetPkgData = fs.readFileSync(path.resolve(pgPath, 'package.json'), 'utf8');
                logPoint(JSON.stringify({
                    targetPkgData: targetPkgData
                }, null, '\t'));
                if (targetPkgData) {
                    const targetPkg = JSON.parse(targetPkgData);
                    logPoint('pkgDataParsed')
                    if (targetPkg && version === targetPkg.version) {
                        logPoint('pkgData installed with correct version ' + installed++);
                    }
                }
            } catch (err) {
                logPoint(JSON.stringify({
                    err
                }, true, '\t'));
            }
        }
        packages.push(fullPkgName);
    });

    if (!packages.length || installedCount === packages.length) {
        return;
    }
    try {
        deleteFolderRecursive(path.resolve(basedir, 'node_modules'));
        savePackageJsnFile(file.getPackageName() + '/' + file.getPathInPackage(), basedir);
        ensureDepsInstalled(basedir, packages);
    } catch (err) {
        logPoint(JSON.stringify({
            message: 'Couldn\'t install NPM package: ' + err.toString(),
            sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
        }, null, '\t'));
        file.error({
            message: 'Couldn\'t install NPM package: ' + err.toString(),
            sourcePath: file.getPackageName() + '/' + file.getPathInPackage()
        });
    }
}

Plugin.registerCompiler({
    //extensions: [],//['npm.json']
    filenames:['myPacks.npm.json']
}, () => {
    return new UniverseModulesNPMBuilder();
});
