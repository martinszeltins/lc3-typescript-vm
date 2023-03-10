import fs = require('fs')
import { VirtualMachine } from './vm'

let programFileLocation = '/home/martins/Programming/lc3-typescript-vm/sample-lc3-program/2048.obj'
let programData = fs.readFileSync(programFileLocation)
let programDataUInt16 = new Uint16Array(programData.length / 2)

for (var i = 0; i < programData.length; i += 2) {
    let uint16 = programData[i] << 8 | programData[i+1]
    programDataUInt16[i / 2] = uint16
}

let virtualMachine = new VirtualMachine([])
virtualMachine.readProgram(programDataUInt16)
virtualMachine.run()
