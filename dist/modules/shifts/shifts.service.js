"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShifts = getShifts;
exports.getShiftById = getShiftById;
exports.createShift = createShift;
exports.updateShift = updateShift;
exports.deleteShift = deleteShift;
const prisma_1 = require("../../prisma");
async function getShifts() {
    return prisma_1.prisma.shift.findMany();
}
async function getShiftById(id) {
    return prisma_1.prisma.shift.findUnique({ where: { id } });
}
async function createShift(data) {
    return prisma_1.prisma.shift.create({ data });
}
async function updateShift(id, data) {
    return prisma_1.prisma.shift.update({ where: { id }, data });
}
async function deleteShift(id) {
    return prisma_1.prisma.shift.delete({ where: { id } });
}
//# sourceMappingURL=shifts.service.js.map