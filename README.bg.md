# ⚡ VoltForge Studio

<p align="center">
  <strong>Проектирайте. Симулирайте. Анализирайте.</strong><br>
  Open-source среда за проектиране и симулация на електронни схеми за web и desktop.
</p>

<p align="center">
  <a href="https://drnecrotix.github.io/volt-forge-stodio/"><img alt="Стартирай VoltForge Studio" src="https://img.shields.io/badge/🚀_Стартирай_VoltForge_Studio-Онлайн-2ea44f?style=for-the-badge"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/releases"><img alt="Releases" src="https://img.shields.io/badge/📦_Releases-Windows_x64-8250df?style=for-the-badge"></a>
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/🇬🇧_README-English-blue?style=for-the-badge"></a>
</p>

<p align="center">
  <a href="https://github.com/drnecrotix/volt-forge-stodio/releases"><img alt="Версия 0.1.0" src="https://img.shields.io/badge/version-0.1.0-blue.svg"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/pages.yml"><img alt="GitHub Pages" src="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/pages.yml/badge.svg"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/windows-build.yml"><img alt="Windows x64 Build" src="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/windows-build.yml/badge.svg"></a>
  <a href="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/release.yml"><img alt="Release" src="https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/release.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-yellow.svg"></a>
</p>

VoltForge Studio е open-source среда за визуално изграждане, симулиране и анализ на електронни схеми със SPICE. Проектът съчетава schematic editor, управление на проекти, генериране на netlist, симулационни процеси, waveform анализ, browser приложение и Python desktop приложение.

## 🚀 Изпробвай VoltForge Studio онлайн

Browser версията се публикува автоматично чрез GitHub Pages.

### [Стартирай VoltForge Studio →](https://drnecrotix.github.io/volt-forge-stodio/)

Онлайн версията се обновява автоматично при промени по web приложението в `main`.

## 📦 Desktop Builds

VoltForge Studio има автоматизиран Windows x64 build pipeline с PyInstaller.

- **Текуща package версия:** `0.1.0`
- **Windows build workflow:** [Windows Desktop Build](https://github.com/drnecrotix/volt-forge-stodio/actions/workflows/windows-build.yml)
- **Release downloads:** [GitHub Releases](https://github.com/drnecrotix/volt-forge-stodio/releases)

Windows workflow artifacts се генерират от GitHub Actions. Публичните release downloads ще се появяват в Releases страницата при публикуване на version tag.

## ✨ Основни възможности

- Визуално редактиране и поставяне на електронни компоненти
- Свързване с проводници и редактиране на стойности
- Запазване, зареждане, import и export на JSON проекти
- Генериране на Ngspice-съвместими SPICE netlist файлове
- Симулационни процеси и диагностика
- Transient waveform визуализация и CSV export
- Browser базиран редактор с GitHub Pages deployment
- Python/PySide6 desktop приложение
- Автоматичен CI за Python 3.10, 3.11 и 3.12
- JavaScript syntax проверки
- CodeQL security scanning
- Dependabot за dependency updates
- Автоматични Windows x64 builds с PyInstaller
- Автоматично release пакетиране с GitHub Actions

## 🖥️ Преглед на проекта

### Визуална работна среда

Изграждай и анализирай схеми чрез удобен workspace с component controls, live measurements, simulation status и editable schematic canvas.

![VoltForge Studio visual circuit workspace](docs/images/voltforge-studio-workspace.png)

### Transient waveform viewer

Преглеждай симулирани сигнали, избирай отделни traces, инспектирай стойности с cursor и export-вай waveform data като CSV.

![VoltForge Studio transient waveform viewer](docs/images/transient-waveform-viewer.png)

### Схема и напрежения по възли

Преглеждай schematic representation с component labels, стойности, node voltages и ясно дефиниран ground reference.

![VoltForge Studio circuit schematic with live node values](docs/images/circuit-schematic.png)

## 🧩 Технологии

### Desktop приложение

- Python 3.10+
- PySide6
- Ngspice като simulation backend
- Optional PyQtGraph waveform visualization
- PyInstaller Windows builds

### Web приложение

- HTML
- CSS
- JavaScript
- Browser-based schematic editor
- Client-side project persistence
- SPICE netlist generation
- Waveform visualization
- GitHub Pages deployment

## 📌 Статус на проекта

VoltForge Studio е в **ранен етап на разработка**. Repository-то включва Python desktop MVP, browser приложение, reusable web modules, автоматизирани проверки, Windows builds, tests, примерни схеми и документация.

Интерфейсите, архитектурата и техническите решения могат да се променят преди първата стабилна версия.

## 🛠️ Начало

### Изисквания

- Git
- Python 3.10 или по-нова версия
- Ngspice, достъпен през системния `PATH`

Провери необходимите инструменти:

```bash
git --version
python --version
ngspice --version
```

### Клонирай repository-то

```bash
git clone https://github.com/drnecrotix/volt-forge-stodio.git
cd volt-forge-stodio
```

### Създай virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS и Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Инсталирай desktop приложението

```bash
python -m pip install --upgrade pip
python -m pip install -e ".[plot]"
```

### Стартирай desktop приложението

```bash
python -m opencircuitlab.main
```

Или използвай инсталирания entry point:

```bash
opencircuitlab
```

### Стартирай тестовете

```bash
python -m unittest discover -s tests
```

## 🌐 Web приложение

Browser приложението няма package dependencies или build стъпка.

Можеш да го стартираш локално от root директорията:

```bash
python -m http.server 8000
```

След това отвори `http://localhost:8000` в модерен browser.

За hosted версията използвай:

### [🚀 Стартирай live web приложението](https://drnecrotix.github.io/volt-forge-stodio/)

## 📁 Структура на repository-то

```text
.
├── src/opencircuitlab/   # Python desktop приложение
├── tests/                # Python unit tests
├── examples/             # Примерни circuit проекти
├── docs/                 # User/developer документация и screenshots
├── webapp/               # Reusable browser modules
├── app.js                # Основно browser приложение
├── index.html            # Web entry point
├── styles.css            # Web interface styles
└── pyproject.toml        # Python package и dependency конфигурация
```

## ✅ Automation и качество

VoltForge Studio използва GitHub Actions за автоматична проверка и пакетиране на проекта.

Текущата automation включва:

- Python CI за поддържаните Python версии
- JavaScript syntax checks
- CodeQL static security analysis
- Dependabot dependency updates
- GitHub Pages deployment
- Windows x64 PyInstaller builds
- Python source/wheel release packaging

## 📦 Releases

Release процесът е автоматизиран чрез GitHub Actions. При push на version tag като `v0.1.0` могат да се изпълнят тестове, да се build-нат distributable packages, да се валидират и да се създадат release artifacts.

Виж [Releases](https://github.com/drnecrotix/volt-forge-stodio/releases) и [CHANGELOG.md](CHANGELOG.md) за историята на версиите.

## 🗺️ Roadmap

Разработката е организирана около simulation workflows, schematic editing, по-широка analysis поддръжка, desktop packaging и последващи подобрения на browser приложението.

Виж [ROADMAP.md](ROADMAP.md).

## 🤝 Принос към проекта

Приноси, bug reports, feature requests, документационни подобрения и code reviews са добре дошли.

Преди да допринасяш:

1. Прочети [CONTRIBUTING.md](CONTRIBUTING.md).
2. Следвай [Code of Conduct](CODE_OF_CONDUCT.md).
3. Използвай предоставените issue и pull request templates.
4. Докладвай security vulnerabilities според [SECURITY.md](SECURITY.md).

## 🆘 Поддръжка

Виж [SUPPORT.md](SUPPORT.md) за usage въпроси, bug-report насоки, feature requests и очаквания за поддръжка.

## 📄 Лиценз

VoltForge Studio е open-source software, разпространяван под [MIT License](LICENSE).

## 🌍 Език

- **Български:** този документ
- **English:** [README.md](README.md)

## 👤 Maintainer

- GitHub: [@drnecrotix](https://github.com/drnecrotix)
- Проект: [VoltForge Studio](https://github.com/drnecrotix/volt-forge-stodio)
