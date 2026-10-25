
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def cells_from(src):
    cells, kind, lines = [], None, []
    for line in src.splitlines():
        if line.startswith('# %%'):
            if kind:
                cells.append((kind, lines))
            kind, lines = ('markdown' if '[markdown]' in line else 'code'), []
            continue
        lines.append(line)
    if kind:
        cells.append((kind, lines))
    return cells


def main():
    src = open(os.path.join(HERE, 'notebook_src.py')).read()
    features = open(os.path.join(HERE, 'features.py')).read()
    nb_cells = []

    def add(kind, text):
        text = text.strip('\n')
        cell = {'cell_type': kind, 'metadata': {}, 'source': [l + '\n' for l in text.split('\n')]}
        cell['source'][-1] = cell['source'][-1].rstrip('\n')
        if kind == 'code':
            cell.update(execution_count=None, outputs=[])
        nb_cells.append(cell)

    for kind, lines in cells_from(src):
        if kind == 'markdown':
            add('markdown', '\n'.join(l[2:] if l.startswith('# ') else l.lstrip('#') for l in lines))
            continue
        text = '\n'.join(lines)
        if '# @@FEATURES@@' in text:
            add('code', '%%writefile features.py\n' + features)
            text = text.replace('# @@FEATURES@@', '').strip('\n')
        add('code', text)

    nb = {'cells': nb_cells, 'metadata': {'colab': {'provenance': []}, 'kernelspec': {'display_name': 'Python 3', 'name': 'python3'},
                                          'language_info': {'name': 'python'}}, 'nbformat': 4, 'nbformat_minor': 0}
    out = os.path.join(HERE, 'Cricket_Coach_Training.ipynb')
    with open(out, 'w') as f:
        json.dump(nb, f, indent=1)
    print('wrote', out, len(nb_cells), 'cells')


if __name__ == '__main__':
    main()
