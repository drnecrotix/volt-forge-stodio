# VoltForge Studio User Guide

## English

### What the program does

VoltForge Studio is a beginner-friendly circuit editor and Ngspice frontend.

You can:

- place basic components
- connect them with wires
- edit their values
- save and load projects as JSON
- generate a SPICE netlist
- run a transient simulation with Ngspice
- view waveforms in a separate window

In the browser build you can also:

- open the **SPICE** workbench
- preview generated netlists directly in the page
- run a lightweight transient preview for linear circuits
- export waveform data as CSV

The desktop MVP also includes a simple **Language** menu for English and Bulgarian.

### How to install it

1. Install Python 3.10 or newer
2. Open a terminal in the project folder
3. Install the package:

```bash
python -m pip install -e ".[plot]"
```

### How to install Ngspice

VoltForge Studio needs Ngspice for simulation.

- Windows: install Ngspice and make sure `ngspice.exe` is in `PATH`
- Linux: use your package manager, for example `sudo apt install ngspice`
- macOS: use Homebrew, for example `brew install ngspice`

If Ngspice is missing, the program shows a clear error message.

### How to create a resistor divider circuit

1. Start the app with `python -m opencircuitlab.main`
2. Add one voltage source
3. Add two resistors
4. Add one ground component
5. Switch to the wire tool
6. Connect:
   - source positive to resistor 1
   - resistor 1 to resistor 2
   - resistor 2 to ground
   - source negative to ground
7. Edit values if needed, for example:
   - `V1 = 5`
   - `R1 = 1k`
   - `R2 = 1k`

### How to run a transient simulation

1. Set the transient step, for example `1ms`
2. Set the transient stop time, for example `100ms`
3. Click **Run Ngspice**

VoltForge Studio generates a netlist, runs Ngspice in batch mode, and collects the waveform data.

### How to view waveforms

After a successful run:

1. The waveform viewer opens
2. Check the signals you want to display
3. Use the mouse to zoom and pan
4. Move the mouse over the graph to see cursor values
5. Use **Export CSV** if you want to save plot data

### How to report bugs

Please include:

- what you built
- what you expected
- what happened instead
- your OS
- Python version
- whether Ngspice is installed
- screenshots or the JSON project if possible

### How to contribute new components

1. Add the component in the catalog
2. Add SPICE generation support
3. Add tests
4. Add documentation and an example circuit

## Български

### Какво прави програмата

VoltForge Studio е лесен за начинаещи редактор на електрически схеми с връзка към Ngspice.

Можеш да:

- добавяш основни компоненти
- свързваш компонентите с кабели
- променяш стойностите им
- записваш и зареждаш проект като JSON
- генерираш SPICE netlist
- пускаш transient симулация чрез Ngspice
- разглеждаш вълновите форми в отделен прозорец

Desktop MVP версията има и прост **Language** menu за английски и български.

### Как се инсталира

1. Инсталирай Python 3.10 или по-нова версия
2. Отвори терминал в папката на проекта
3. Инсталирай пакета:

```bash
python -m pip install -e ".[plot]"
```

### Как се инсталира Ngspice

Ngspice е нужен за симулациите.

- Windows: инсталирай Ngspice и добави `ngspice.exe` в `PATH`
- Linux: използвай package manager, например `sudo apt install ngspice`
- macOS: използвай Homebrew, например `brew install ngspice`

Ако Ngspice липсва, програмата ще покаже ясно съобщение за грешка.

### Как да направиш делител на напрежение

1. Стартирай приложението с `python -m opencircuitlab.main`
2. Добави един източник на напрежение
3. Добави два резистора
4. Добави един ground компонент
5. Превключи на wire tool
6. Свържи:
   - плюсът на източника към първия резистор
   - първия резистор към втория резистор
   - втория резистор към ground
   - минусът на източника към ground
7. Промени стойностите при нужда, например:
   - `V1 = 5`
   - `R1 = 1k`
   - `R2 = 1k`

### Как да пуснеш transient симулация

1. Задай transient step, например `1ms`
2. Задай stop time, например `100ms`
3. Натисни **Run Ngspice**

VoltForge Studio ще генерира netlist, ще стартира Ngspice в batch mode и ще обработи резултатите.

### Как да гледаш waveforms

След успешна симулация:

1. Ще се отвори waveform viewer
2. Маркирай сигналите, които искаш да виждаш
3. Използвай мишката за zoom и pan
4. Премести курсора върху графиката, за да виждаш стойности
5. Натисни **Export CSV**, ако искаш да запазиш данните

### Как да докладваш бъгове

Добре е да изпратиш:

- каква схема си направил
- какво си очаквал
- какво е станало вместо това
- коя операционна система ползваш
- версията на Python
- дали Ngspice е инсталиран
- screenshot или JSON проекта, ако е възможно

### Как да добавяш нови компоненти

1. Добави компонента в catalog файла
2. Добави поддръжка за SPICE генерация
3. Добави тестове
4. Добави документация и примерна схема
