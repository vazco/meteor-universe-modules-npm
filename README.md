<a href="http://unicms.io"><img src="http://unicms.io/banners/standalone.png" /></a>
# Universe Modules NPM
Extension for package universe:modules that adds possibility of bundling npm packages into universe modules. 

And you can use it, just like that:
```
import cn from '{username:mypackage}/packages/classnames';
```

### How It works

#### Into Package
1. Create file <name>.npm.json, like packages.import-npm.json and add it to package.js by api.addFiles
2. In package.js add dependency `universe:modules-npm`
3. Add some packages under key **dependencies** (as a name:version pairs) to this file:

```
{
  "dependencies": {
      "classnames": "2.1.3",
      // You can even attach comments here
      "typographic-numbers": "0.2.1"
  }
}
```

4. You can import already added packages.

```
import classNames from '{username:mypackage}/packages/classnames';
import typographicNumbers from '{username:mypackage}/packages/typographic-numbers';
```

#### In app
You can use It outside of package too.
To do that please create and add in application space file `myfile.npm.json`.
And now, you can import something like this: `import classNames from 'myfile/classnames'`

### Options
This package uses browserify for bundling.
You can pass options in the same file under key **browserify** to make changes on this process

```
{
  "dependencies": {
     "browserify-global-shim": "1.0.0"
  },
  "browserify": {
      "transforms": {
      //using react from meteor package in npm modules
        "browserify-global-shim": {
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
