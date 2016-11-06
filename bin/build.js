import fs from 'fs';
import path from 'path';
import app from 'commander';
import less from 'less';
import metalsmith from 'metalsmith';
import layouts from 'metalsmith-layouts';
import markdown from 'metalsmith-markdown';
import { keys } from 'ramda';
import pkgInfo from '../package';
import { Observable } from 'rxjs';

const { from, bindCallback } = Observable;

const watch = bindCallback(fs.watch);

const projDir  = process.env.PROJECT_DIR;
const tmplDir  = path.join(projDir, 'template');
const lessFile = path.join(tmplDir, 'layout.less');

app.
  version(pkgInfo.version).
  option('-w, --watch', 'watch the files in source and rebuild when they change').
  option('-s, --source [PATH]', 'path to the source directory [./]', './').
  option('-d, --destination [PATH]', 'path to the destination directory [./]', './');

let watcher = null;

const configure = opts =>
  metalsmith(projDir).
  metadata({ author: pkgInfo.author }).
  source(opts.source).
  destination(opts.destination).
  clean(false).
  use((files, ms, done) => {
    keys(files).
      forEach(filepath => {
        const isNodeModules = /node_modules/.test(filepath);
        const isMarkdown = /\.md$/.test(filepath);

        if (!isMarkdown || isNodeModules) {
          delete files[filepath];
        }
      });
    done();
  }).
  use((files, ms, done) => {
    if (!opts.watch) {
      return done();
    }

    if (!watcher) {
      watcher =
        from(keys(files).concat(lessFile)).
        mergeMap(filepath => watch(filepath)).
        do(() => console.log('rebuilding...')).
        subscribe(() => build(opts), error => console.error(error), () => console.log('complete'));
    }

    done();
  }).
  use(markdown()).
  use((files, ms, done) => {
    files['index.html'] = files['README.html'];
    delete files['README.html'];
    done();
  }).
  use(layouts({
    engine:    'ejs',
    directory: 'template',
    default:   'layout.ejs',
    rename:    true
  }));

const build = opts =>
  configure(opts).
  build(error => {
    if (error) {
      throw error;
    }

    const src     = fs.readFileSync(lessFile, 'utf8');
    const cssFile = path.join(app.destination, 'styles.css');

    less.
      render(src).
      then(({ css }) => fs.writeFileSync(cssFile, css, 'utf8'));

    console.log('done');
  });

app.
  command('run').
  description('generate the site directory').
  action(() => build(app));

app.parse(process.argv);

