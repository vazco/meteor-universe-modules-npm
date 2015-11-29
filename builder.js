const Browserify = Npm.require('browserify');
const stream = Npm.require('stream');
const stripJsonComments = Npm.require('strip-json-comments');
const npm = Npm.require('npm');
const os = Npm.require('os');
const {fs, path} = Plugin;

/**
 * Logs given messages to a file
 *
 * @methodName logMsg
 * @param {...String} args - collection/map/whatever of arguments to be logged
 */
function logMsg(...args) {
    console.log('=>',...args, '\r\n');
    Plugin.nudge && Plugin.nudge();
}

const getString = Meteor.wrapAsync((bundle, cb) => {
    let string = '';
    bundle.on('data', (data) => string += data);
    bundle.once('end', () => cb(void 0, string));
    return bundle.once('error', cb);
});

class UniverseModulesNPMBuilder extends CachingCompiler {
    constructor() {
        super({
            compilerName: 'UniverseModulesNPMBuilder',
            defaultCacheSize: 1024 * 1024 * 10
        });
    }

    getCacheKey(file) {
        return file.getSourceHash() + file.getPathInPackage() + JSON.stringify(file.getFileOptions());
    }

    compileResultSize(compileResult) {
        return compileResult.length * 2;
    }

    /**
     * Gets the base directory for a given file based on file location
     *
     * @param {Object} file - handle for file that is to be compiled
     * @returns {string} the full qualified path containing given  file
     */
    getBasedir(file) {
        const basedir = path.resolve(Plugin.convertToStandardPath(os.tmpdir()), 'universe-npm');
        return path.resolve(basedir, getProjectSourcePath(file).replace(/[^a-zA-Z0-9\-]/g, '_'));
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
                if (!systemDependencies.some(toImport => moduleName.indexOf(toImport + '/') === 0 )) {
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



    compileOneFile(file) {
        const sourcePath = getProjectSourcePath(file);
        logMsg('Universe NPM: ' + sourcePath);
        try {
            const {source, config, moduleId} = this.prepareSource(file);
            const optionsForBrowserify = this.getBrowserifyOptions(file, config.browserify);
            const browserify = Browserify([source], optionsForBrowserify); // eslint-disable-line new-cap
            config.system = config.system || {};
            this.excludeFromBundle(browserify, config.system.dependencies, config.system);
            this.applyTransforms(browserify, optionsForBrowserify);
            const bundle = browserify.bundle();
            bundle.setEncoding('utf8');
            return this.getCompileResult(bundle, config.system, moduleId);
        } catch (_error) {
            Plugin.nudge && Plugin.nudge();
            file.error({
                message: _error.message,
                sourcePath
            });
        }
    }

    /**
     * Applies supplied browserify transforms to source files
     * @param {mystery} browserify -  the browserify instance
     * @param {object} browserifyOptions - map in the format of { ..., transformName: { ...transformOptions... }, ... }
     */
    applyTransforms(browserify, browserifyOptions) {
        if (browserifyOptions && browserifyOptions.transforms) {
            _.forEach(browserifyOptions.transforms, (transformOptions, transformName) => {
                browserify.transform(transformName, transformOptions);
            });
        }
    }

    getCompileResult(bundle, {dependencies, config, _bundleIndexes}, moduleId) {
        const source = getString(bundle);
        if (!Array.isArray(dependencies)) {
            dependencies = [];
        }
        // adding important system deps
        if (dependencies._deps) {
            dependencies.push(...(Object.keys(dependencies._deps)));
        }
        const depPromisesStr = dependencies.map(dep =>
            `"${System.normalizeSync(dep)}"`
        ).join(',') || '';
        return (
`
__UniverseNPMDynamicLoader("${moduleId}", [${depPromisesStr}], ${JSON.stringify(config)}, (function(require, _uniSysExports, _uniSysModule) {
    ${source}
}), ${JSON.stringify(_bundleIndexes)});
`
        );
    }

    getBrowserifyOptions(file, userOptions) {
        userOptions = userOptions || {};
        const defaultOptions = {
            basedir: Plugin.convertToOSPath(this.getBasedir(file)),
            debug: true,
            ignoreMissing: true,
            transforms: {
                //other default transforms would go here
            }
        };
        _.defaults(userOptions, defaultOptions);
        /**
         * forcing envify defeats the purpose of _.defaults, just use _.extend then
         *
         * AFTER, looking trough the code that used to be here, I figured out that it
         * would have the same effect as _.defaults, its just unnecessary because we
         * already use _.defaults. The only difference would be that if user passed
         * defaultOptions = {..., transforms: { envify:null }, ...}
         * your code would overwrite it and force user to use envify because it checks null
         */
        return userOptions;
    }

    /**
     * Folds System.js wrapper around given file
     *
     * @param {Object} file - handle for file that is to be compiled
     * @returns {{source: string, config: Object, moduleId: string, modulesToExport: string}}
     */
    prepareSource(file) {
        const source = new stream.PassThrough();
        const config = JSON.parse(stripJsonComments(file.getContentsAsString()));
        const moduleId = this.getModuleId(file);
        let lines = '';
        config.packages = config.packages || config.dependencies;
        if (config && config.packages) {
            _.each(config.packages, (version, packageName) => {
                lines += (
                `    _uniSysModule.exports['${packageName}'] = require('${packageName}');` + '\n'
                );
            });
            lines += (
                `    _uniSysModule.exports._bundleRequire = require;` + '\n'
            );
            installPackages(this.getBasedir(file), file, config.packages);
        }
        source.end(lines);
        return {source, config, moduleId};
    }

    /**
     * Gets the id of the module that given source file will be compiled into
     * @param {Object} file - handle for file that is to be compiled
     * @returns {string} the id of the module the given file will compile to
     */
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
    logMsg('Installing npm packages: ' + packages.join(', ') + '\r\n');
    npm.load((err) => {
        err && cb(err);
        npm.commands.install(Plugin.convertToOSPath(basedir), packages, cb);
    });
});


function installPackages(basedir, file, packageList) {
    const packages = [];
    var installedCount = 0;
    _.map(packageList, (version, packageName) => {
        if (typeof version === 'object') {
            version = version.version;
        }
        if (!version) {
            file.error({
                message: 'Missing version of npm package: ' + packageName,
                sourcePath: getProjectSourcePath(file)
            });
            return;
        }
        const fullPkgName = packageName + '@' + version;
        const pgPath = path.resolve(basedir, 'node_modules', packageName);
        if (fs.existsSync(pgPath)) {
            try {
                const targetPkgData = fs.readFileSync(path.resolve(pgPath, 'package.json'), 'utf8');
                if (targetPkgData) {
                    const targetPkg = JSON.parse(targetPkgData);
                    if (targetPkg && version === targetPkg.version) {
                        installedCount++;
                    }
                }
            } catch (err) {
                logMsg(...err);
            }
        }
        packages.push(fullPkgName);
    });

    if (!packages.length || installedCount === packages.length) {
        return;
    }
    try {
        deleteFolderRecursive(path.resolve(basedir, 'node_modules'));
        savePackageJsnFile(getProjectSourcePath(file), basedir);
        ensureDepsInstalled(basedir, packages);
    } catch (err) {
        file.error({
            message: 'Couldn\'t install NPM package: ' + err.toString(),
            sourcePath: getProjectSourcePath(file)
        });
    }
}

function deleteFolderRecursive(pathToDelete) { // eslint was giving me errors saying "path" was already defined within scope
    if (fs.existsSync(pathToDelete)) {
        fs.readdirSync(pathToDelete).forEach((file) => {
            const curPath = pathToDelete + '/' + file;
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(pathToDelete);
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

    if (!fs.existsSync(basedir)) {
        fs.mkdir(basedir, e => !e && fs.writeFile(path.resolve(basedir, 'package.json'), data, 'utf8', () => {}));
    } else {
        fs.writeFile(path.resolve(basedir, 'package.json'), data, 'utf8', () => {});
    }
}

function getProjectSourcePath (file) {
    return (file.getPackageName() || '') + '/' + file.getPathInPackage();
}

Plugin.registerCompiler({
    extensions: ['npm.json']
}, () => {
    return new UniverseModulesNPMBuilder();
});
