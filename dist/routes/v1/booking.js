"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bookingRouter = exports.generateBookingId = void 0;
exports.formatDate = formatDate;
exports.calculateCost = calculateCost;
exports.generateOTP = generateOTP;
const express_1 = require("express");
const types_1 = require("../../types");
const middleware_1 = require("../../middleware");
const folder_1 = require("./folder");
const dotenv_1 = __importDefault(require("dotenv"));
const src_1 = __importDefault(require("../../store/src"));
const delete_1 = require("./delete");
const customer_1 = require("./customer");
const nodemailer_1 = __importDefault(require("nodemailer"));
dotenv_1.default.config();
function formatDate(date) {
    return new Date(date).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}
function calculateCost(startDate, endDate, startTime, endTime, pricePer24Hours) {
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);
    startDateTime.setHours(startHour, startMinute, 0, 0);
    endDateTime.setHours(endHour, endMinute, 0, 0);
    let timeDifference = endDateTime.getTime() - startDateTime.getTime();
    let hoursDifference = timeDifference / (1000 * 60 * 60);
    let cost = (hoursDifference / 24) * pricePer24Hours;
    return Math.floor(cost);
}
const generateBookingId = () => __awaiter(void 0, void 0, void 0, function* () {
    // Get the last booking entry
    const lastBooking = yield src_1.default.booking.findFirst({
        orderBy: { id: "desc" }, // Get the latest booking
    });
    let newId;
    if (!lastBooking) {
        newId = "JCR010001"; // Start from this if no bookings exist
    }
    else {
        // Extract numeric part from last ID
        const lastIdNumber = parseInt(lastBooking.id.replace("JCR01", ""), 10);
        newId = `JCR01${(lastIdNumber + 1).toString().padStart(4, "0")}`;
    }
    return newId;
});
exports.generateBookingId = generateBookingId;
exports.bookingRouter = (0, express_1.Router)();
function generateOTP() {
    let digits = '0123456789';
    let OTP = '';
    let len = digits.length;
    for (let i = 0; i < 4; i++) {
        OTP += digits[Math.floor(Math.random() * len)];
    }
    return OTP;
}
exports.bookingRouter.post("/", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.BookingSchema.safeParse(req.body);
    if (!parsedData.success) {
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    try {
        let customerId = parsedData.data.customerId;
        const car = yield src_1.default.car.findFirst({
            where: {
                id: parsedData.data.carId,
            },
            include: {
                bookings: true
            }
        });
        if (!car) {
            res.status(400).json({ message: "Invalid car id" });
            return;
        }
        const isAvailable = (0, customer_1.isCarAvailable)(car, (0, customer_1.combiningDateTime)(parsedData.data.startDate, parsedData.data.startTime), (0, customer_1.combiningDateTime)(parsedData.data.endDate, parsedData.data.endTime));
        if (!isAvailable) {
            res.status(400).json({ message: "Car is not available" });
            return;
        }
        if (!customerId || customerId === 0) {
            const folder = yield (0, folder_1.createFolder)(parsedData.data.customerName + "_" + parsedData.data.customerContact, "customer");
            if (!folder.folderId || folder.error) {
                res.status(400).json({
                    message: "Failed to create folder",
                    error: folder.error,
                });
                return;
            }
            const customer = yield src_1.default.customer.create({
                data: {
                    name: parsedData.data.customerName,
                    contact: parsedData.data.customerContact,
                    folderId: folder.folderId,
                    joiningDate: formatDate(new Date()),
                },
            });
            customerId = customer.id;
        }
        const newBookingId = yield (0, exports.generateBookingId)();
        const currDate = new Date();
        const unixTimeStamp = Math.floor(currDate.getTime() / 1000);
        const folder = yield (0, folder_1.createFolder)(newBookingId + " " + unixTimeStamp, "booking");
        if (!folder.folderId || folder.error) {
            res.status(400).json({
                message: "Failed to create folder",
                error: folder.error,
            });
            return;
        }
        const booking = yield src_1.default.booking.create({
            data: {
                id: newBookingId,
                startDate: formatDate(parsedData.data.startDate),
                endDate: formatDate(parsedData.data.endDate),
                startTime: parsedData.data.startTime,
                endTime: parsedData.data.endTime,
                allDay: parsedData.data.allDay,
                carId: parsedData.data.carId,
                dailyRentalPrice: parsedData.data.dailyRentalPrice,
                totalEarnings: parsedData.data.totalAmount,
                userId: req.userId,
                status: "Upcoming",
                customerId: customerId,
                bookingFolderId: folder.folderId,
                advancePayment: parsedData.data.advance,
                type: parsedData.data.type,
            },
        });
        res.json({
            message: "Booking created successfully",
            bookingId: booking.id,
            folderId: folder.folderId,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.get("/all", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield src_1.default.user.findFirst({
            where: {
                id: req.userId,
            },
        });
        if (!user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const bookings = yield src_1.default.booking.findMany({
            include: {
                car: {
                    include: {
                        photos: true
                    }
                },
                customer: true,
            },
            orderBy: [{ id: "desc" }],
        });
        const formatedBookings = bookings.map((booking) => {
            var _a;
            return {
                id: booking.id,
                start: booking.startDate,
                end: booking.endDate,
                startTime: booking.startTime,
                endTime: booking.endTime,
                status: booking.status,
                carId: booking.car.id,
                carName: booking.car.brand + " " + booking.car.model,
                carPlateNumber: booking.car.plateNumber,
                carImageUrl: ((_a = booking.car.photos[0]) === null || _a === void 0 ? void 0 : _a.url) || '',
                customerName: booking.customer.name,
                customerContact: booking.customer.contact,
                carColor: booking.car.colorOfBooking,
                odometerReading: booking.car.odometerReading,
                fastrack: booking.fastrack,
                cancelledBy: booking.cancelledBy,
                otp: booking.otp,
                type: booking.type,
                isAdmin: req.userId === booking.userId || req.userId === 1
            };
        });
        res.json({
            message: "Bookings fetched successfully",
            bookings: formatedBookings,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.get("/requested", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield src_1.default.user.findFirst({
            where: {
                id: req.userId,
            },
        });
        if (!user) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }
        const bookings = yield src_1.default.booking.findMany({
            include: {
                car: true,
                customer: true,
            },
            where: {
                status: "Requested",
            }
        });
        const formatedBookings = bookings.map((booking) => {
            return {
                id: booking.id,
                start: booking.startDate,
                end: booking.endDate,
                startTime: booking.startTime,
                endTime: booking.endTime,
                status: booking.status,
                carId: booking.car.id,
                customerName: booking.customer.name,
                customerContact: booking.customer.contact,
                type: booking.type,
            };
        });
        res.json({
            message: "Bookings fetched successfully",
            bookings: formatedBookings,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.get("/:id", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield src_1.default.user.findFirst({
            where: {
                id: req.userId,
            },
        });
        if (!user) {
            const customer = yield src_1.default.customer.findFirst({
                where: {
                    id: req.userId,
                },
            });
            if (!customer && req.userId != 80) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
        }
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
            },
            include: {
                car: {
                    include: {
                        photos: true
                    }
                },
                carImages: true,
                customer: {
                    include: {
                        documents: true,
                    },
                },
            },
        });
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        const formatedBooking = {
            id: booking.id,
            start: booking.startDate,
            end: booking.endDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            status: booking.status,
            customerName: booking.customer.name,
            customerContact: booking.customer.contact,
            customerMail: booking.customer.email,
            carId: booking.car.id,
            carName: booking.car.brand + " " + booking.car.model,
            carPlateNumber: booking.car.plateNumber,
            carImageUrl: booking.car.photos[0].url,
            dailyRentalPrice: booking.dailyRentalPrice,
            securityDeposit: booking.securityDeposit,
            totalPrice: booking.totalEarnings,
            advancePayment: booking.advancePayment,
            customerAddress: booking.customer.address,
            paymentMethod: booking.paymentMethod,
            odometerReading: booking.odometerReading,
            endodometerReading: booking.endodometerReading,
            fastrack: booking.fastrack,
            endfastrack: booking.endfastrack,
            notes: booking.notes,
            selfieUrl: booking.selfieUrl,
            documents: booking.customer.documents,
            carImages: booking.carImages,
            customerId: booking.customerId,
            folderId: booking.customer.folderId,
            bookingFolderId: booking.bookingFolderId,
            currOdometerReading: booking.car.odometerReading,
            cancelledBy: booking.cancelledBy,
            type: booking.type,
            otp: booking.otp,
        };
        // Filter out null values dynamically
        const filteredBooking = Object.fromEntries(Object.entries(formatedBooking).filter(([_, value]) => value !== null));
        res.json({
            message: "Booking fetched successfully",
            booking: filteredBooking,
            isAdmin: req.userId === booking.userId || req.userId === 1
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/delete-multiple", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.MultipleBookingDeleteSchema.safeParse(req.body);
    if (!parsedData.success) {
        console.error("Validation error:", parsedData.error);
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    try {
        for (const id of req.body.bookingIds) {
            let booking;
            if (req.userId !== 1) {
                booking = yield src_1.default.booking.findFirst({
                    where: {
                        id: id,
                        userId: req.userId,
                    },
                });
            }
            else {
                booking = yield src_1.default.booking.findFirst({
                    where: {
                        id: id,
                    },
                });
            }
            if (!booking) {
                res.status(400).json({ message: "Booking not found" });
                return;
            }
            yield src_1.default.carImages.deleteMany({
                where: {
                    bookingId: id,
                },
            });
            yield src_1.default.booking.delete({
                where: {
                    id: booking.id,
                },
            });
            if (booking.status.toLocaleLowerCase() !== "completed" && booking.totalEarnings) {
                yield src_1.default.car.update({
                    where: {
                        id: booking.carId,
                    },
                    data: {
                        totalEarnings: {
                            decrement: booking.totalEarnings,
                        },
                    },
                });
            }
            ;
            yield (0, folder_1.deleteFolder)(booking.bookingFolderId);
        }
        res.json({
            message: "Booking deleted successfully",
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/update-date", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const bookings = yield src_1.default.booking.findMany();
        for (const booking of bookings) {
            yield src_1.default.booking.update({
                where: {
                    id: booking.id,
                },
                data: {
                    startDate: formatDate(booking.startDate),
                    endDate: formatDate(booking.endDate),
                }
            });
        }
        res.json({
            message: "Booking dates updated successfully",
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/update", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.BookingUpdateSchema.safeParse(req.body);
    if (!parsedData.success) {
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
            },
        });
        if (!booking || ![booking.userId, 1].includes(req.userId)) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        const updateData = {};
        const updateCustomerData = {};
        if (parsedData.data.startDate !== undefined)
            updateData.startDate = formatDate(parsedData.data.startDate);
        if (parsedData.data.endDate !== undefined)
            updateData.endDate = formatDate(parsedData.data.endDate);
        if (parsedData.data.startTime !== undefined)
            updateData.startTime = parsedData.data.startTime;
        if (parsedData.data.endTime !== undefined)
            updateData.endTime = parsedData.data.endTime;
        if (parsedData.data.allDay !== undefined)
            updateData.allDay = parsedData.data.allDay;
        if (parsedData.data.status !== undefined)
            updateData.status = parsedData.data.status;
        if (parsedData.data.carId !== undefined)
            updateData.carId = parsedData.data.carId;
        if (parsedData.data.securityDeposit !== undefined)
            updateData.securityDeposit = parsedData.data.securityDeposit;
        if (parsedData.data.dailyRentalPrice !== undefined)
            updateData.dailyRentalPrice = parsedData.data.dailyRentalPrice;
        if (parsedData.data.paymentMethod !== undefined)
            updateData.paymentMethod = parsedData.data.paymentMethod;
        if (parsedData.data.advancePayment !== undefined)
            updateData.advancePayment = parsedData.data.advancePayment;
        if (parsedData.data.odometerReading !== undefined)
            updateData.odometerReading = parsedData.data.odometerReading;
        if (parsedData.data.endOdometerReading !== undefined)
            updateData.endodometerReading = parsedData.data.endOdometerReading;
        if (parsedData.data.notes !== undefined)
            updateData.notes = parsedData.data.notes;
        if (parsedData.data.type !== undefined)
            updateData.type = parsedData.data.type;
        if (parsedData.data.selfieUrl !== undefined)
            updateData.selfieUrl = parsedData.data.selfieUrl;
        updateData.totalEarnings = parsedData.data.totalAmount;
        if (parsedData.data.customerName !== undefined)
            updateCustomerData.name = parsedData.data.customerName;
        if (parsedData.data.customerAddress !== undefined)
            updateCustomerData.address = parsedData.data.customerAddress;
        if (parsedData.data.customerContact !== undefined)
            updateCustomerData.contact = parsedData.data.customerContact;
        if (updateCustomerData && booking.customerId) {
            yield src_1.default.customer.update({
                where: { id: booking.customerId },
                data: Object.assign({}, updateCustomerData),
            });
        }
        const updatedbooking = yield src_1.default.booking.update({
            data: Object.assign(Object.assign({}, updateData), { carId: updateData.carId }),
            where: {
                id: booking.id,
            },
            include: {
                carImages: true,
                customer: {
                    include: {
                        documents: true,
                    },
                },
            },
        });
        const documents = updatedbooking.customer.documents.map((document) => {
            return {
                id: document.id,
                name: document.name,
                url: document.url,
                type: document.type,
            };
        });
        if (parsedData.data.documents) {
            for (const document of parsedData.data.documents) {
                const doc = yield src_1.default.document.create({
                    data: {
                        name: document.name,
                        url: document.url,
                        type: document.type,
                        customerId: booking.customerId,
                        docType: document.docType || "others"
                    },
                });
                documents.push({
                    id: doc.id,
                    name: doc.name,
                    url: doc.url,
                    type: doc.type,
                });
            }
        }
        const carImages = updatedbooking.carImages.map((carImage) => {
            return {
                id: carImage.id,
                name: carImage.name,
                url: carImage.url,
                bookingId: carImage.bookingId,
            };
        });
        if (parsedData.data.carImages) {
            for (const carImage of parsedData.data.carImages) {
                const image = yield src_1.default.carImages.create({
                    data: {
                        name: carImage.name,
                        url: carImage.url,
                        bookingId: booking.id,
                    },
                });
                carImages.push({
                    id: image.id,
                    name: image.name,
                    url: image.url,
                    bookingId: image.bookingId,
                });
            }
        }
        res.json({
            message: "Booking updated successfully",
            bookingId: booking.id,
            documents: documents,
            carImages: carImages,
            selfieUrl: updatedbooking.selfieUrl,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/cancel", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
                userId: req.userId
            },
        });
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        yield src_1.default.booking.update({
            where: {
                id: req.params.id,
            },
            data: {
                status: "Cancelled",
                cancelledBy: "host"
            }
        });
        res.json({
            message: "Booking cancelled successfully",
            BookingId: req.params.id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/consent", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
            },
            include: {
                customer: true,
                car: true,
            }
        });
        if (!booking || (booking.userId !== req.userId && req.userId !== 1)) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        const action = req.body.action;
        const transporter = nodemailer_1.default.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        if (action === "confirm") {
            yield src_1.default.booking.update({
                where: {
                    id: req.params.id,
                },
                data: {
                    status: "Upcoming",
                }
            });
            {
                booking.customer.email &&
                    (yield transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: booking.customer.email,
                        subject: "Booking Confirmation - Jain Car Rentals",
                        text: `Dear ${booking.customer.name || "Customer"},\n\nThank you for choosing Jain Car Rentals.\n\nWe’re pleased to confirm your booking (ID: ${booking.id}) for the following vehicle:\n\nCar: ${booking.car.brand + " " + booking.car.model}\n\nCar Number: ${booking.car.plateNumber}\n\nBooking Period:\n\nFrom: ${formatDate(booking.startDate)} at ${booking.startTime}\n\nTo: ${formatDate(booking.endDate)} at ${booking.endTime}\n\n${booking.type === "pickup" ?
                            "Please ensure you arrive on time for pickup and carry a valid ID."
                            :
                                "Car will be delivered to your address on the day of the booking. Please ensure you have valid ID"}\n\nIf you have any questions or need to make changes to your booking, feel free to contact us.\n\nWe look forward to serving you.\n\nBest regards,\n\nJain Car Rentals
          `,
                    }));
            }
            res.json({
                message: "Booking approved successfully",
                BookingId: req.params.id,
            });
            return;
        }
        else if (action === "reject") {
            yield src_1.default.booking.update({
                where: {
                    id: req.params.id,
                },
                data: {
                    status: "Cancelled",
                    cancelledBy: "host"
                }
            });
            console.log("into the step 3");
            {
                booking.customer.email &&
                    (yield transporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: booking.customer.email,
                        subject: "Booking Rejected - Jain Car Rentals",
                        text: `Dear ${booking.customer.name || "Customer"},\n\nWe are sorry to inform you that your booking (ID: ${booking.id}) for the following vehicle was not accepted by car owner.\n\nIf you have any questions or need to make changes to your booking, feel free to contact us.\n\nWe look forward to serving you.\n\nBest regards,\n\nJain Car Rentals
          `,
                    }));
            }
            console.log("into the step 4");
            res.json({
                message: "Booking cancelled successfully",
                BookingId: req.params.id,
            });
            return;
        }
        res.status(400).json({
            message: "Wrong action string",
            BookingId: req.params.id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/start/document", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.BookingStartDocumentSchema.safeParse(req.body);
    if (!parsedData.success) {
        console.error("Validation error:", parsedData.error);
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    const otp = req.query.otp;
    try {
        let booking;
        if (req.query.role === "customer") {
            const user = yield src_1.default.customer.findFirst({
                where: {
                    id: req.userId,
                }
            });
            if (!user) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                },
            });
            if (booking && (!otp || otp !== booking.otp)) {
                res.status(400).json({ message: "Invalid OTP" });
                return;
            }
        }
        else {
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                    userId: req.userId,
                },
            });
        }
        yield src_1.default.booking.update({
            data: {
                selfieUrl: parsedData.data.selfieUrl,
            },
            where: {
                id: req.params.id,
            },
        });
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        if (parsedData.data.documents) {
            for (const document of parsedData.data.documents) {
                yield src_1.default.document.create({
                    data: {
                        name: document.name,
                        url: document.url,
                        type: document.type,
                        customerId: booking.customerId,
                        docType: document.docType || "others"
                    },
                });
            }
        }
        if (parsedData.data.carImages) {
            for (const carImage of parsedData.data.carImages) {
                yield src_1.default.carImages.create({
                    data: {
                        name: carImage.name,
                        url: carImage.url,
                        bookingId: booking.id,
                    },
                });
            }
        }
        res.json({
            message: "Booking started successfully",
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/start", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.BookingStartSchema.safeParse(req.body);
    if (!parsedData.success) {
        console.error("Validation error:", parsedData.error);
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    const otp = req.query.otp;
    try {
        let booking;
        if (req.query.role === "customer") {
            const user = yield src_1.default.customer.findFirst({
                where: {
                    id: req.userId,
                }
            });
            if (!user) {
                res.status(401).json({ message: "Unauthorized" });
                return;
            }
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                },
            });
            if (booking && (!otp || otp !== booking.otp)) {
                res.status(400).json({ message: "Invalid OTP" });
                return;
            }
        }
        else {
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                    userId: req.userId,
                },
            });
        }
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        yield src_1.default.car.update({
            where: { id: booking.carId },
            data: {
                odometerReading: parsedData.data.odometerReading,
                fastrack: parsedData.data.fastrack,
            },
        });
        yield src_1.default.customer.update({
            where: { id: booking.customerId },
            data: {
                name: parsedData.data.customerName,
                contact: parsedData.data.customerContact,
                address: parsedData.data.customerAddress,
                email: parsedData.data.customerMail,
            },
        });
        const updatedBooking = yield src_1.default.booking.update({
            data: {
                carId: parsedData.data.selectedCar,
                startDate: formatDate(parsedData.data.startDate),
                startTime: parsedData.data.startTime,
                endDate: formatDate(parsedData.data.returnDate),
                endTime: parsedData.data.returnTime,
                securityDeposit: parsedData.data.securityDeposit,
                odometerReading: parsedData.data.odometerReading,
                fastrack: parsedData.data.fastrack,
                advancePayment: parsedData.data.bookingAmountReceived,
                totalEarnings: parsedData.data.totalAmount,
                paymentMethod: parsedData.data.paymentMethod,
                notes: parsedData.data.notes,
                dailyRentalPrice: parsedData.data.dailyRentalPrice,
                status: "Ongoing"
            },
            where: {
                id: req.params.id,
            },
        });
        res.json({
            message: "Booking started successfully",
            updatedStatus: updatedBooking.status,
            updatedFastrack: updatedBooking.fastrack,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.put("/:id/end", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.BookingEndSchema.safeParse(req.body);
    if (!parsedData.success) {
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
                userId: req.userId,
            },
        });
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        const cost = calculateCost(new Date(booking.startDate), new Date(booking.endDate), booking.startTime, booking.endTime, booking.dailyRentalPrice);
        const updatedBooking = yield src_1.default.booking.update({
            data: {
                endDate: formatDate(parsedData.data.endDate),
                endTime: parsedData.data.endTime,
                status: "Completed",
                endodometerReading: parsedData.data.odometerReading,
                endfastrack: parsedData.data.fastrack,
                otp: ''
            },
            where: {
                id: req.params.id,
                userId: req.userId,
            },
        });
        let increment = 0;
        if (updatedBooking.totalEarnings && updatedBooking.totalEarnings > 0) {
            increment = updatedBooking.totalEarnings;
        }
        yield src_1.default.car.update({
            where: {
                id: updatedBooking.carId,
                userId: req.userId,
            },
            data: {
                totalEarnings: {
                    increment,
                },
                odometerReading: parsedData.data.odometerReading,
                fastrack: parsedData.data.fastrack,
            },
        });
        res.json({
            message: "Booking ended successfully",
            updatedStatus: updatedBooking.status,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.delete("/:id", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let booking;
        if (req.userId !== 1) {
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                    userId: req.userId,
                },
                include: {
                    carImages: true,
                },
            });
        }
        else {
            booking = yield src_1.default.booking.findFirst({
                where: {
                    id: req.params.id,
                },
                include: {
                    carImages: true,
                },
            });
        }
        if (!booking) {
            res.status(400).json({ message: "Booking not found" });
            return;
        }
        yield src_1.default.carImages.deleteMany({
            where: {
                bookingId: booking.id,
            },
        });
        if (booking.carImages.length > 0) {
            yield (0, delete_1.deleteMultipleFiles)(booking.carImages.map((carImage) => carImage.url));
        }
        yield src_1.default.booking.delete({
            where: {
                id: booking.id,
                userId: req.userId,
            },
        });
        if (booking.status.toLocaleLowerCase() !== "completed" && booking.totalEarnings) {
            yield src_1.default.car.update({
                where: {
                    id: booking.carId,
                },
                data: {
                    totalEarnings: {
                        decrement: booking.totalEarnings,
                    },
                },
            });
        }
        ;
        if (booking.selfieUrl) {
            yield (0, delete_1.deleteFile)(booking.selfieUrl);
        }
        yield (0, folder_1.deleteFolder)(booking.bookingFolderId);
        res.json({
            message: "Booking deleted successfully",
            BookingId: booking.id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.delete("/:id/car-images/all", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: id,
                userId: req.userId,
            },
            include: {
                carImages: true,
            },
        });
        if (!booking) {
            res.status(400).json({
                message: "Booking not found",
            });
            return;
        }
        yield src_1.default.carImages.deleteMany({
            where: {
                bookingId: id,
            },
        });
        yield (0, delete_1.deleteMultipleFiles)(booking.carImages.map((carImage) => carImage.url));
        res.status(200).json({
            message: "Car image deleted successfully",
            BookingId: id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.post("/multiple", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const parsedData = types_1.MultipleBookingSchema.safeParse(req.body);
    if (!parsedData.success) {
        res
            .status(400)
            .json({ message: "Wrong Input type", error: parsedData.error });
        return;
    }
    try {
        const dataSet = parsedData.data;
        const bookings = [];
        for (const data of dataSet) {
            let customer = yield src_1.default.customer.findFirst({
                where: {
                    name: data.customerName,
                    contact: data.customerContact,
                },
            });
            if (!customer) {
                const folder = yield (0, folder_1.createFolder)(data.customerName + "_" + data.customerContact, "customer");
                if (!folder.folderId || folder.error) {
                    res.status(400).json({
                        message: "Failed to create folder",
                        error: folder.error,
                    });
                    return;
                }
                customer = yield src_1.default.customer.create({
                    data: {
                        name: data.customerName,
                        contact: data.customerContact,
                        address: data.customerAddress,
                        folderId: folder.folderId,
                        joiningDate: formatDate(new Date()),
                    },
                });
            }
            const newBookingId = yield (0, exports.generateBookingId)();
            const currDate = new Date();
            const unixTimeStamp = Math.floor(currDate.getTime() / 1000);
            const folder = yield (0, folder_1.createFolder)(newBookingId + " " + unixTimeStamp, "booking");
            if (!folder.folderId || folder.error) {
                res.status(400).json({
                    message: "Failed to create folder",
                    error: folder.error,
                });
                return;
            }
            let booking = yield src_1.default.booking.create({
                data: {
                    id: newBookingId,
                    startDate: formatDate(data.startDate),
                    endDate: formatDate(data.endDate),
                    startTime: data.startTime,
                    endTime: data.endTime,
                    allDay: data.allDay,
                    status: data.status,
                    carId: data.carId,
                    userId: req.userId,
                    securityDeposit: data.securityDeposit,
                    dailyRentalPrice: data.dailyRentalPrice,
                    advancePayment: data.advancePayment,
                    totalEarnings: data.totalEarnings,
                    paymentMethod: data.paymentMethod,
                    odometerReading: data.odometerReading,
                    notes: data.notes,
                    customerId: customer.id,
                    bookingFolderId: folder.folderId,
                },
            });
            bookings.push({
                id: newBookingId,
                startDate: formatDate(data.startDate),
                endDate: formatDate(data.endDate),
                startTime: data.startTime,
                endTime: data.endTime,
                status: data.status,
                carId: data.carId,
                customerId: customer.id,
                customerName: customer.name,
                customerContact: customer.contact,
            });
        }
        res.status(200).json({ message: "Booking created successfully", bookings });
        return;
    }
    catch (err) {
        console.error(err);
        res.status(400).json({
            message: "Internal server error",
            error: err,
        });
        return;
    }
}));
exports.bookingRouter.delete("/car-image/:id", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const carImage = yield src_1.default.carImages.delete({
            where: {
                id: parseInt(req.params.id),
            },
        });
        yield (0, delete_1.deleteFile)(carImage.url);
        res.status(200).json({
            message: "Car image deleted successfully",
            BookingId: req.params.id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
exports.bookingRouter.delete("/selfie-url/:id", middleware_1.middleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const booking = yield src_1.default.booking.findFirst({
            where: {
                id: req.params.id,
                userId: req.userId,
            },
            include: {
                carImages: true,
            },
        });
        if (!booking) {
            res.status(400).json({
                message: "Booking not found",
            });
            return;
        }
        if (booking.selfieUrl) {
            yield (0, delete_1.deleteFile)(booking.selfieUrl);
        }
        yield src_1.default.booking.update({
            where: {
                id: req.params.id,
            },
            data: {
                selfieUrl: "",
            },
        });
        res.status(200).json({
            message: "selfie deleted successfully",
            BookingId: req.params.id,
        });
        return;
    }
    catch (e) {
        console.error(e);
        res.status(400).json({
            message: "Internal server error",
            error: e,
        });
        return;
    }
}));
