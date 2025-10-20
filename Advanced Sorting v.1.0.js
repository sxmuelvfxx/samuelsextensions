class AdvancedSorting {
    getInfo() {
        return {
            id: 'advancedSorting',
            name: 'Advanced Sorting',
            color1: '#4a90e2',
            color2: '#357ABD',
            blocks: [
                {
                    opcode: 'sortDataList',
                    blockType: 'command',
                    text: 'Sort Data List [DATA] and store Pointers in [POINTERS]',
                    arguments: {
                        DATA: { type: 'string', defaultValue: 'Data' },
                        POINTERS: { type: 'string', defaultValue: 'Pointers' }
                    }
                }
            ]
        };
    }

    // Safe list lookup: stage first, then sprite
    getListByName(name, util) {
        const vm = Scratch.vm;
        if (!vm) return null;

        const stageTarget = vm.runtime.targets.find(t => t.isStage);
        let listObj = Object.values(stageTarget.variables).find(v => v.type === 'list' && v.name === name);
        if (!listObj) {
            listObj = Object.values(util.target.variables).find(v => v.type === 'list' && v.name === name);
        }
        return listObj || null;
    }

    sortDataList({DATA, POINTERS}, util) {
        const dataList = this.getListByName(DATA, util);
        const pointersList = this.getListByName(POINTERS, util);

        if (!dataList || !pointersList) {
            console.warn(`Data or Pointers list not found!`);
            return;
        }

        const n = dataList.value.length;
        if (n === 0) {
            pointersList.value.splice(0, pointersList.value.length);
            return;
        }

        // Copy data to numeric array
        const dataValues = dataList.value.map(v => Number(v));

        // Generate pointers 1..n
        const pointers = Array.from({ length: n }, (_, i) => i + 1);

        // Sort pointers based on data values
        pointers.sort((a, b) => dataValues[a - 1] - dataValues[b - 1]);

        // Replace the pointers list safely
        pointersList.value.splice(0, pointersList.value.length);
        pointersList.value.push(...pointers);
    }
}

Scratch.extensions.register(new AdvancedSorting());
