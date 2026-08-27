# 安装包

| 文件 | 平台 | 用法 |
| --- | --- | --- |
| [viva-lang-0.2.0.tgz](./viva-lang-0.2.0.tgz) | Win / macOS / Linux（Node ≥ 18） | `npm install -g ./viva-lang-0.2.0.tgz` |
| [SHA256SUMS](./SHA256SUMS) | 校验 | `sha256sum -c SHA256SUMS` |

这是 `npm pack` 打出来的语言包：里面有 `viva` / `viva-mcp`、编译器、examples、手册。

自己重打：

```bash
npm run pack:release
# or: npm run build && npm pack --pack-destination packages
```

完整发布目录（安装脚本 + Docker 附件）还是 `npm run pack:release` → `release/`。
