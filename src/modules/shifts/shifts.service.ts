import prisma from '../../prisma';

export async function getShifts() {
  return prisma.shift.findMany();
}

export async function getShiftById(id: string) {
  return prisma.shift.findUnique({ where: { id } });
}

export async function createShift(data: any) {
  return prisma.shift.create({ data });
}

export async function updateShift(id: string, data: any) {
  return prisma.shift.update({ where: { id }, data });
}

export async function deleteShift(id: string) {
  return prisma.shift.delete({ where: { id } });
}