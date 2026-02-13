# AnimeStudio Export Helper

批量导出《Arknights: Endfield》`.chk` 资源的小脚本。

## Quick Start

1. 将 `AnimeStudio.CLI.exe` 放在本项目根目录（默认读取这里）。
2. 执行：

```powershell
node .\export.js "C:\Path\To\VFS"
```

脚本会递归扫描输入路径下所有 `.chk` 文件并导出到 `.\assets`。

## CLI Path

默认 CLI 路径：

```text
.\AnimeStudio.CLI.exe
```

你也可以显式指定 CLI 路径：

```powershell
node .\export.js "C:\Path\To\VFS" --cli "D:\Tools\AnimeStudio.CLI.exe"
```

## Output

执行后会生成：

- `assets/`：导出的资源文件
- `assets/log/*.log`：每个 `.chk` 的导出日志
- `assets/assets_map.txt`：导出结果树形清单

# Credit

- https://github.com/Escartem/AnimeStudio

# 声明

本项目仅用于学习与技术研究，导出的《明日方舟：终末地》相关资源版权归鹰角网络所有。  
请勿将导出资源用于任何商业用途或非法用途。  
如有侵权或不当使用问题，请联系处理，仓库维护者将及时删除相关内容。
