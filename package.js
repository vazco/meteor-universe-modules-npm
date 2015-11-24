var UniverseModulesRelease = '0.6.3'; // eslint-disable-line no-var
Package.describe({
    name: 'universe:modules-npm',
    version: UniverseModulesRelease,
    // Brief, one-line summary of the package.
    summary: 'Import NPM packages on client & server, mapping dependencies on system js modules (useful for React)',
    // URL to the Git repository containing the source code for this package.
    git: 'https://github.com/vazco/meteor-universe-modules-npm',
    // By default, Meteor will default to using README.md for documentation.
    // To avoid submitting documentation, set this field to null.
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'UniverseModulesNPMBuilder',
    use: ['meteor', 'underscore@1.0.4', 'ecmascript@0.1.6', 'caching-compiler@1.0.0'],
    sources: ['builder.js'],
    npmDependencies: {
        'browserify': '12.0.1',
        //'envify': '3.4.0',
        'strip-json-comments': '2.0.0',
        'camelcase': '2.0.1',
        'npm': '3.4.1'
    }
});

Package.onUse(function(api) {
    api.versionsFrom('1.2.1');
    api.use([
        'universe:modules@' + UniverseModulesRelease,
        'isobuild:compiler-plugin@1.0.0'
    ]);

    api.imply('universe:modules@' + UniverseModulesRelease);
    api.imply('promise');
});
