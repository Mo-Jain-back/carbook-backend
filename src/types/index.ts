import z from "zod";

const bufferSchema = z.instanceof(Buffer);

export const SignupSchema = z.object({
  username: z.string(),
  password: z.string(),
  name: z.string(),
  imageUrl: z.string().url().optional(),
});

export const SigninSchema = z.object({
  username: z.string(),
  password: z.string().optional(),
  provider: z.string().optional(),
  name:z.string().optional(),
  imageUrl:z.string().url().optional()
});

export const customerSignupSchema = z.object({
  name: z.string(),
  contact: z.string(),
  password: z.string(),
  email:z.string().email()
});

export const UpdateUserSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
  profileFolderId: z.string().optional(),
});

export const CarsSchema = z.object({
  brand: z.string(),
  model: z.string(),
  plateNumber: z.string(),
  color: z.string(),
  price: z.number(),
  mileage: z.number(),
  imageUrl: z.string().url(),
  carFolderId: z.string(),
  seats: z.number(),
  fuel: z.string()
});

export const CarsUpdateSchema = z.object({
  color: z.string().optional(),
  price: z.number().optional(),
  mileage: z.number().optional(),
  seats: z.number().optional(),
  fuel: z.string().optional(),
  gear: z.string().optional()
});

export const CarsActionSchema = z.object({
  action: z.enum(["active", "pause"]),
});


export const CarPhotosSchema = z.object({
  urls: z.array(z.string().url()),
});

export const FilterCarsSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime:z.string(),
  user: z.string()
})

export const BookingSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean(),
  carId: z.number(),
  customerName: z.string(),
  customerContact: z.string(),
  dailyRentalPrice: z.number(),
  totalAmount: z.number(),
  type: z.string(),
  customerId: z.number().optional(),
  advance: z.number().optional(),
});

const DocumentSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  url: z.string().url(),
  type: z.string(),
  folderId: z.string().optional(),
  docType: z.string().optional()
});

export const BookingUpdateSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  status: z.string().optional(),
  carId: z.number().optional(),
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  customerContact: z.string().optional(),
  securityDeposit: z.string().optional(),
  dailyRentalPrice: z.number().optional(),
  paymentMethod: z.string().optional(),
  advancePayment: z.number().optional(),
  odometerReading: z.string().optional(),
  endOdometerReading: z.string().optional(),
  notes: z.string().optional(),
  totalAmount: z.number(),
  documents: z.array(DocumentSchema).optional(),
  selfieUrl: z.string().url().optional(),
  carImages: z.array(DocumentSchema).optional(),
  type: z.string().optional(),
});

export const MultipleBookingSchema = z.array(
  z.object({
    startDate: z.string(),
    endDate: z.string(),
    startTime: z.string(),
    endTime: z.string(),
    allDay: z.boolean(),
    status: z.string(),
    carId: z.number(),
    securityDeposit: z.string().optional(),
    dailyRentalPrice: z.number(),
    advancePayment: z.number().optional(),
    totalEarnings: z.number().optional(),
    paymentMethod: z.string().optional(),
    odometerReading: z.string().optional(),
    notes: z.string().optional(),
    customerName: z.string(),
    customerContact: z.string(),
    customerAddress: z.string().optional(),
  }),
);

export const BookingStartSchema = z.object({
  bookingAmountReceived: z.number().optional(),
  dailyRentalPrice: z.number(),
  notes: z.string().optional(),
  odometerReading: z.string(),
  fastrack: z.number(),
  paymentMethod: z.string().optional(),  
  returnDate: z.string(),
  returnTime: z.string(),
  securityDeposit: z.string(),
  selectedCar: z.number(),
  startDate: z.string(),
  startTime: z.string(),
  totalAmount: z.number(),
  customerAddress: z.string(),
  customerName: z.string(),
  customerContact: z.string(),
  customerMail: z.string(),
});

export const BookingStartDocumentSchema = z.object({
  documents: z.array(DocumentSchema).optional(),
  selfieUrl: z.string().url().optional(),
  carImages: z.array(DocumentSchema).optional(),
})

export const BookingEndSchema = z.object({
  endDate: z.string(),
  endTime: z.string(),
  odometerReading: z.string(),
  fastrack: z.number(),
});

export const MultipleBookingDeleteSchema = z.object({
  bookingIds: z.array(z.string()),
});

export const CalendarUpdateSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  allDay: z.boolean().optional(),
  customerName: z.string().optional(),
});

export const CustomerCreateSchema = z.object({
  name: z.string(),
  contact: z.string(),
  address: z.string(),
  folderId: z.string(),
  email: z.string(),
  joiningDate: z.string(),
  documents: z.array(DocumentSchema).optional(),
});

export const CustomerUpdateSchema = z.object({
  name: z.string(),
  contact: z.string().optional(),
  address: z.string(),
  email: z.string().optional(),
  folderId: z.string().optional(),
  joiningDate: z.string().optional(),
  documents: z.array(DocumentSchema).optional(),
  deletedPhotos: z.array(z.object({
    id:z.number(),
    url:z.string().url()
  })).optional(),
  kycStatus: z.string().optional()  
});

export const CustomerUpdatePasswordSchema = z.object({
  currPassword: z.string().optional(),
  newPassword: z.string()
})

export const CustomerBookingSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  allDay: z.boolean(),
  carId: z.number(),
  totalAmount: z.number(),
  type: z.string(),
});

export const CustomerProfileSchema = z.object({
  name: z.string().optional(),
  contact: z.string().optional(),
  password: z.string().optional(),
  imageUrl: z.string().optional(),
  address: z.string().optional(),
})

declare global {
  namespace Express {
    export interface Request {
      userId?: number;
      name?: string;
    }
  }
}
