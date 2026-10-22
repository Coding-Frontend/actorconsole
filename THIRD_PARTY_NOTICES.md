# Third party notices

MIT covers this project's own source. Third-party assets and dependencies retain their respective terms.

## Fonts

Preserve these notices with redistributed fonts:

- [Bricolage Grotesque](apps/web/src/fonts/OFL-Bricolage-Grotesque.txt).
- [IBM Plex Sans](apps/web/src/fonts/OFL-IBM-Plex-Sans.txt).
- [IBM Plex Mono](apps/web/src/fonts/OFL-IBM-Plex-Mono.txt).

## Product icons

The 12 SVGs in `apps/web/public/ai-tools-logos` are unmodified files from [Lobe Icons](https://github.com/lobehub/lobe-icons/tree/ab8cbcc6ce806b923c547628132957c8a8b61509/packages/static-svg/icons), pinned to commit `ab8cbcc6ce806b923c547628132957c8a8b61509`. Their copyright notice and MIT license are included in [LICENSE.txt](apps/web/public/ai-tools-logos/LICENSE.txt). [SOURCES.json](apps/web/public/ai-tools-logos/SOURCES.json) records each upstream file, Git blob and SHA-256 digest. Preserve both files when redistributing these icons.

This records the icon collection's copyright license. Product names and marks remain with their respective owners; the project's MIT license grants no trademark rights or endorsement. The icons identify compatible clients. Follow applicable owner guidelines, including [OpenAI](https://openai.com/brand/) and [Cursor](https://cursor.com/brand), when using their marks in your own distribution or marketing.

The prior VS Code and Zed SVGs had no recorded redistribution source and are not bundled. Their compatibility entries use the generic code icon from the existing Lucide dependency. Unused product SVGs have also been removed.

## Dependencies

Preserve dependency license/notice files in binary distributions. Review the versions in `pnpm-lock.yaml` when updating dependencies.
