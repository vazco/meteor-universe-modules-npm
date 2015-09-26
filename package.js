Package.describe({
    name: 'universe:modules-npm',
    version: '0.7.0',
    // Brief, one-line summary of the package.
    summary: 'Import of npm packages that works on client and server',
    // URL to the Git repository containing the source code for this package.
    git: 'https://github.com/vazco/meteor-universe-modules-npm',
    // By default, Meteor will default to using README.md for documentation.
    // To avoid submitting documentation, set this field to null.
    documentation: 'README.md'
});

Package.registerBuildPlugin({
    name: 'UniverseModulesNPMBuilder',
    use: ['meteor', 'underscore@1.0.3', 'ecmascript', 'caching-compiler@1.0.0'],
    sources: ['builder.js'],
    npmDependencies: {
        'browserify': '11.1.0',
        'envify': '3.4.0',
        'exorcist': '0.4.0',
        'json-comments': '0.2.1',
        'exposify': '0.4.3',
        'camelcase': '1.2.1',
        'npm': '2.14.2'
    }
});

Package.onUse(function (api) {
    api.versionsFrom('1.1.0.3');
    api.use([
        'universe:modules'
    ]);

    // Use Meteor 1.2 build plugin
    api.use('isobuild:compiler-plugin@1.0.0');

    api.use('react-runtime', {weak:true});
});
