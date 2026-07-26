# 个人学术主页

简约学术风的单页个人主页。纯静态、单文件、零外部依赖(无 CDN、无 Google Fonts,在中国大陆网络环境下也能完整加载)。

## 本地预览

直接双击 `index.html` 用浏览器打开即可,无需任何构建工具或服务器。

## 修改内容

所有内容都在 `index.html` 一个文件里,用任何文本编辑器打开,把占位信息替换成你自己的:

- 姓名「张三 (San Zhang)」、单位、一句话身份
- 顶部四个链接(Email / GitHub / Google Scholar / ORCID)的 `href`
- 简介、研究方向、论文、项目、动态、教育经历各版块的文字
- 头像:当前是内联 SVG 占位图,想换成照片时,把 `<svg>...</svg>` 整段替换为
  `<img src="avatar.jpg" alt="个人照片">`,并把照片文件放在本目录下

## 部署到 GitHub Pages

1. 在 GitHub 新建一个仓库。两种命名方式:
   - 仓库名叫 `<你的用户名>.github.io` → 网址就是 `https://<你的用户名>.github.io/`(推荐)
   - 其他任意名字(如 `homepage`)→ 网址是 `https://<你的用户名>.github.io/homepage/`
2. 在本目录执行:

   ```
   git init
   git add .
   git commit -m "个人主页初版"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

3. 打开仓库的 **Settings → Pages**,Source 选 **Deploy from a branch**,
   Branch 选 `main` / `(root)`,保存。约一分钟后网址即可访问。
4. 以后每次改完内容,`git add . && git commit -m "更新" && git push` 即自动发布。

### 绑定自定义域名(可选)

在 Settings → Pages 的 Custom domain 填入你的域名,并在域名服务商处
添加 CNAME 记录指向 `<你的用户名>.github.io`。
