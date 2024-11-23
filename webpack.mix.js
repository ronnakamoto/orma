const mix = require('laravel-mix');
const tailwindcss = require('tailwindcss');

mix.setPublicPath('dist')
   .js('src/background/index.js', 'dist/js/background.js')
   .js('src/content/index.jsx', 'dist/js/content.js')
   // Temporarily disabled ChatGPT context injection
   // .js('src/content-scripts/chatgpt.js', 'dist/js/chatgpt-content.js')
   .js('src/popup/index.jsx', 'dist/js/popup.js')
   .js('src/offscreen/index.js', 'dist/js/offscreen.js')
   .react()
   .postCss('src/css/app.css', 'dist/css/app.css', [
     require('postcss-import'),
     tailwindcss('./tailwind.config.js'),
     require('autoprefixer'),
   ])
   .copy('src/manifest.json', 'dist')
   .copy('src/html/popup.html', 'dist')
   .copy('src/html/offscreen.html', 'dist')
   .webpackConfig({
     module: {
       rules: [
         {
           test: /\.mjs$/,
           include: /node_modules/,
           type: 'javascript/auto'
         }
       ]
     },
     resolve: {
       fallback: {
         "path": false,
         "fs": false
       }
     }
   })
   .disableNotifications();