declare var process: any

enum Register {
    R_R0 = 0,
    R_R1,
    R_R2,
    R_R3,
    R_R4,
    R_R5,
    R_R6,
    R_R7,
    R_PC, /* program counter */
    R_COND,
    R_COUNT
}

enum Opcode {
    OP_BR = 0, /* branch */
    OP_ADD,    /* add  */
    OP_LD,     /* load */
    OP_ST,     /* store */
    OP_JSR,    /* jump register */
    OP_AND,    /* bitwise and */
    OP_LDR,    /* load register */
    OP_STR,    /* store register */
    OP_RTI,    /* unused */
    OP_NOT,    /* bitwise not */
    OP_LDI,    /* load indirect */
    OP_STI,    /* store indirect */
    OP_JMP,    /* jump */
    OP_RES,    /* reserved (unused) */
    OP_LEA,    /* load effective address */
    OP_TRAP    /* execute trap */
}

enum ConditionFlag {
    FL_POS = 1 << 0, /* P */
    FL_ZRO = 1 << 1, /* Z */
    FL_NEG = 1 << 2, /* N */ 
}

enum Trap {
    TRAP_GETC  = 0x20,  /* get character from keyboard */
    TRAP_OUT   = 0x21,  /* output a character */
    TRAP_PUTS  = 0x22,  /* output a word string */
    TRAP_IN    = 0x23,  /* input a string */
    TRAP_PUTSP = 0x24,  /* output a byte string */
    TRAP_HALT  = 0x25   /* halt the program */
};

export class VirtualMachine {
    private readonly PC_START   = 0x3000
    private readonly MR_KBSR    = 0xFE00 /* keyboard status mem mapped reg */
    private readonly MR_KBDR    = 0xFE02 /* keyboard data mem mapped reg */

    private memory    = new Uint16Array(65536)
    private registers = new Uint16Array(Register.R_COUNT)
    
    // Providing user input this way for testing
    private inputIndex = 0

    constructor (private readonly programData: string[]) {}

    public readProgram(rawData: Uint16Array) {
        let memoryLocation = rawData[0]

        for (let i = 1; i < rawData.length; i++) {
            this.memory[memoryLocation] = rawData[i]
            memoryLocation++
        }
    }

    public run() {
        this.registers[Register.R_PC] = this.PC_START

        let running = true

        while (running) {
            let pcValue = this.registers[Register.R_PC]
            let instr   = this.memory[pcValue]
            let opcode  = instr >> 12

            this.registers[Register.R_PC]++

            switch (opcode) {
                case Opcode.OP_ADD: {
                    /* destination register (DR) */
                    let r0 = (instr >> 9) & 0x7

                    /* first operand (SR1) */
                    let r1 = (instr >> 6) & 0x7

                    /* whether we are in immediate mode */
                    let imm_flag = (instr >> 5) & 0x1

                    if (imm_flag) {
                        let imm5 = this.sign_extend(instr & 0x1F, 5)

                        this.registers[r0] = this.registers[r1] + imm5
                    } else {
                        let r2 = instr & 0x7

                        this.registers[r0] = this.registers[r1] + this.registers[r2]
                    }

                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_AND: {
                    let r0 = (instr >> 9) & 0x7
                    let r1 = (instr >> 6) & 0x7
                    let imm_flag = (instr >> 5) & 0x1

                    if (imm_flag) {
                        let imm5 = this.sign_extend(instr & 0x1F, 5)
                        this.registers[r0] = this.registers[r1] & imm5
                    } else {
                        let r2 = instr & 0x7
                        this.registers[r0] = this.registers[r1] & this.registers[r2]
                    }

                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_NOT: {
                    let r0 = (instr >> 9) & 0x7
                    let r1 = (instr >> 6) & 0x7
                
                    this.registers[r0] = ~this.registers[r1]
                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_BR:{
                    let pc_offset = this.sign_extend((instr) & 0x1ff, 9)
                    let cond_flag = (instr >> 9) & 0x7

                    if (cond_flag & this.registers[Register.R_COND]) {
                        this.registers[Register.R_PC] += pc_offset
                    }

                    break
                }

                case Opcode.OP_JMP: {
                    /* Also handles RET */
                    let r1 = (instr >> 6) & 0x7

                    this.registers[Register.R_PC] = this.registers[r1]

                    break
                }

                case Opcode.OP_JSR: {
                    let r1 = (instr >> 6) & 0x7
                    let long_pc_offset = this.sign_extend(instr & 0x7ff, 11)
                    let long_flag = (instr >> 11) & 1
                
                    this.registers[Register.R_R7] = this.registers[Register.R_PC]

                    if (long_flag) {
                        this.registers[Register.R_PC] += long_pc_offset  /* JSR */
                    } else {
                        this.registers[Register.R_PC] = this.registers[r1] /* JSRR */
                    }

                    break
                }

                case Opcode.OP_LD: {
                    let r0 = (instr >> 9) & 0x7
                    let pc_offset = this.sign_extend(instr & 0x1ff, 9)

                    this.registers[r0] = this.mem_read(this.registers[Register.R_PC] + pc_offset)
                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_LDI: {
                    /* destination register (DR) */
                    let r0 = (instr >> 9) & 0x7

                    /* PCoffset 9*/
                    let pc_offset = this.sign_extend(instr & 0x1ff, 9)

                    /* add pc_offset to the current PC, look at that memory location to get the final address */
                    this.registers[r0] = this.mem_read(this.mem_read(this.registers[Register.R_PC] + pc_offset))
                    this.update_flags(r0)

                    break
                }
                case Opcode.OP_LDR: {
                    let r0 = (instr >> 9) & 0x7
                    let r1 = (instr >> 6) & 0x7
                    let offset = this.sign_extend(instr & 0x3F, 6)

                    this.registers[r0] = this.mem_read(this.registers[r1] + offset)
                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_LEA: {
                    let r0 = (instr >> 9) & 0x7
                    let pc_offset = this.sign_extend(instr & 0x1ff, 9)

                    this.registers[r0] = this.registers[Register.R_PC] + pc_offset
                    this.update_flags(r0)

                    break
                }

                case Opcode.OP_ST: {
                    let r0 = (instr >> 9) & 0x7
                    let pc_offset = this.sign_extend(instr & 0x1ff, 9)

                    this.mem_write(this.registers[Register.R_PC] + pc_offset, this.registers[r0])

                    break
                }

                case Opcode.OP_STI: {
                    let r0 = (instr >> 9) & 0x7
                    let pc_offset = this.sign_extend(instr & 0x1ff, 9)

                    this.mem_write(this.mem_read(this.registers[Register.R_PC] + pc_offset), this.registers[r0])

                    break
                }

                case Opcode.OP_STR: {
                    let r0 = (instr >> 9) & 0x7
                    let r1 = (instr >> 6) & 0x7
                    let offset = this.sign_extend(instr & 0x3F, 6)

                    this.mem_write(this.registers[r1] + offset, this.registers[r0])

                    break
                }

                case Opcode.OP_TRAP:
                    /* TRAP */
                    switch (instr & 0xFF) {
                        case Trap.TRAP_GETC:
                            /* read a single ASCII char */
                            let inputData = this.getInputAsync()

                            this.registers[Register.R_R0] = this.get_char()

                            break
                        case Trap.TRAP_OUT:
                            console.log(String.fromCharCode(this.registers[Register.R_R0]))

                            break
                        case Trap.TRAP_PUTS: {
                                /* one char per word */
                                let addr = this.registers[Register.R_R0]
                                let charBuffer = []

                                while (this.memory[addr] !== 0) {
                                    charBuffer.push(String.fromCharCode(this.memory[addr]))
                                    addr++
                                }

                                console.log(charBuffer.join(''))

                                break
                            }
                        case Trap.TRAP_IN:
                            this.registers[Register.R_R0] = this.get_char()

                            break
                        case Trap.TRAP_PUTSP: {
                                /* one char per byte (two bytes per word) here we need to swap back to big endian format */
                                let addr = this.registers[Register.R_R0]
                                let charBuffer = []

                                while (this.memory[addr] != 0) {
                                    let char1 = this.memory[addr] & 0xFF

                                    charBuffer.push(String.fromCharCode(char1))

                                    let char2 = this.memory[addr] >> 8

                                    if (char2) {
                                        charBuffer.push(String.fromCharCode(char2))
                                    }

                                    addr++
                                }

                                console.log(charBuffer.join(''))

                                break
                            }
                        case Trap.TRAP_HALT:
                            console.log("HALT")
                            running = false
                            break
                    }
    
                    break
                case Opcode.OP_RES:
                case Opcode.OP_RTI:
                default:
                    console.log("Bad op!")
                    return
            }
        }
    }

    private update_flags(r: number) {
        if (this.registers[r] == 0) {
            this.registers[Register.R_COND] = ConditionFlag.FL_ZRO
        } else if (this.registers[r] >> 15) {
            this.registers[Register.R_COND] = ConditionFlag.FL_NEG
        } else {
            this.registers[Register.R_COND] = ConditionFlag.FL_POS
        }
    }

    private sign_extend(x: number, bitCount: number): number {
        if ((x >> (bitCount - 1)) & 1) {
            x |= (0xFFFF << bitCount)

            // Need to and it with this so we don't exceed 16-bits
            x &= 0xFFFF
        }

        return x
    }

    private mem_write(address: number, value: number) {
        this.memory[address] = value
    }

    private mem_read(address: number) {
        if (address === this.MR_KBSR) {
            let input = this.programData[this.inputIndex]

            if (input != null) {
                this.memory[this.MR_KBSR] = (1 << 15)
                this.memory[this.MR_KBDR] = input.charCodeAt(0)
                this.inputIndex++
            } else {
                this.memory[this.MR_KBSR] = 0
            }
        }

        return this.memory[address]
    }

    public get_char(): number {
        let str = this.programData[this.inputIndex]
        let char = str.charCodeAt(0)
        
        this.inputIndex++

        return char
    }

    /** 
     * Got the idea from https://stackoverflow.com/a/49959557 
     * TODO: this requires user to press enter. Need to find workaround
     */
    public async getInputAsync(): Promise<any> {
        return new Promise(resolve => process.stdin.once('data', (data: any) => {
            console.log('Received')
            console.log(data)

            resolve(data)
        }))
    }
}
