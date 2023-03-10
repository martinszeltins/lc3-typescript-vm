import fs = require('fs')
import { VirtualMachine } from './vm'

let programFileLocation = '/home/martins/Programming/lc3-typescript-vm/sample-lc3-program/2048.obj'
let rawProgramData      = fs.readFileSync(programFileLocation)
let programInstructions = new Uint16Array(rawProgramData.length / 2)

/**
 * programInstructions = [
 *    0011000000000000, // first instruction
 *    0010110000010111, // second instruction
 *    1110101000011000, // third instruction
 *    ...
 * ]
 */
for (var i = 0; i < rawProgramData.length; i += 2) {
    let uint16 = (rawProgramData[i] * 256) + rawProgramData[i + 1];
    programInstructions[i / 2] = uint16
}

let virtualMachine = new VirtualMachine([])
virtualMachine.readProgram(programInstructions)
virtualMachine.run()
