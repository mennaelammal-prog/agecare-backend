"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShiftSchema = exports.createShiftSchema = void 0;
const zod_1 = require("zod");
exports.createShiftSchema = zod_1.z.object({
    clientId: zod_1.z.string().uuid(),
    caregiverId: zod_1.z.string().uuid(),
    startTime: zod_1.z.string().datetime(),
    endTime: zod_1.z.string().datetime(),
    notes: zod_1.z.string().optional()
});
exports.updateShiftSchema = zod_1.z.object({
    startTime: zod_1.z.string().datetime().optional(),
    endTime: zod_1.z.string().datetime().optional(),
    status: zod_1.z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    notes: zod_1.z.string().optional()
});
//# sourceMappingURL=shifts.validation.js.map