<img src="http://uniproject.vazco.eu/black_logo.png" />
# Universe Modules NPM
Extension for package universe:modules that adds possibility of bundling npm packages into universe modules. 

And you can use it, just like that:
```
import {classnames} from '{username:mypackage}/packages!npm';
```

### How It works

#### Into Package
1. Create file <name>.import-npm.json, like packages.import-npm.json
2. In package.js add dependency `universe:modules-npm` (by api.use) and packages.import-npm.json (by api.addFiles)
3. Add some packages (as a name:version pairs) to this file:

```
{
  "classnames": "2.1.3",
  // You can even attach comments here
  "typographic-numbers": "0.2.1"
}
```

4. You can import already added packages.

```
// prefix package name like before and add '!npm' on the end
import {classnames} from '{username:mypackage}/packages!npm';

// Name of package is converted from a dash/dot/underscore
// to the camelCase variable name: foo-bar → fooBar
import {typographicNumbers} from '{username:mypackage}/packages!npm';
```

#### In app
You can use It outside of package too.
To do that please create and add in application space file `myfile.import-npm.json`.
And now, you can import something like this: `import {npmPackage} from 'myfile!npm'`

### Options
This package uses browserify for bundling.
You can pass options in file `browserify.options.json` to make changes on this process

```
{
  "transforms": {
    "exposify": {
      "expose": {
        "react": "Package['react-runtime'].React"
      }
    }
  }
}
```

*Earlier example shows how add transformation that exposes globals as modules so they can be required*

### Restrictions
Because in bundling process, this package uses a browserify. Only browserifyable npm packages will work correctly. If you want use none browserifyable packages please use meteor npm and next,  export them as regular module. 

### Copyright and license

Code and documentation &copy; 2015 [Vazco.eu](http://vazco.eu)
Released under the MIT license. 

This package is part of [Universe](http://unicms.io), a package ecosystem based on [Meteor platform](http://meteor.com) maintained by [Vazco](http://www.vazco.eu).
It works as standalone Meteor package, but you can get much more features when using the whole system.   
