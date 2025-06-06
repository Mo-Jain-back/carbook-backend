import { Router } from "express";
import client from "../../store/src";
import { middleware } from "../../middleware";
import { CustomerBookingSchema, CustomerCreateSchema, CustomerProfileSchema, customerSignupSchema, CustomerUpdatePasswordSchema, CustomerUpdateSchema, FilterCarsSchema, SigninSchema } from "../../types";
import { createFolder, deleteFolder } from "./folder";
import { deleteFile, deleteMultipleFiles } from "./delete";
import jwt from "jsonwebtoken";
import { JWT_PASSWORD } from "../../config";
import { formatDate, generateBookingId, generateOTP } from "./booking";
import dotenv from "dotenv";
import {OAuth2Client} from 'google-auth-library';

// Load environment variables
dotenv.config();

interface Document {
  id: number;
  name: string;
  url: string;
  type: string;
}

export const customerRouter = Router();

const getUserInfo = async (access_token: string) => {
  const response = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${access_token}`);
  const data = await response.json();
  console.log("data",data);
  return data;
}

export function combiningDateTime(date: string, time: string) {
  const dateTime = new Date(date);
  const [hour, minute,second] = time.split(":").map(Number);
  return dateTime.setHours(hour, minute, 0, 0);
}

interface Booking {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  status: string;
}

interface Car {
  id: number;
  bookings: Booking[];
}

export function isCarAvailable(car:Car,searchStart:number,searchEnd:number){
  const newSearchStart = new Date(searchStart);
  const newSearchEnd = new Date(searchEnd);
  const bookings = car.bookings.filter((booking:Booking) => {
    if(booking.status.toLowerCase() === "completed" || booking.status.toLowerCase() === "cancelled") return false;
    const bookingStart = new Date(combiningDateTime(booking.startDate, booking.startTime));
    const bookingEnd = new Date(combiningDateTime(booking.endDate, booking.endTime));
    if(newSearchStart >= bookingStart && newSearchStart <= bookingEnd) return true;
    if(newSearchEnd >= bookingStart && newSearchEnd <= bookingEnd) return true;
    if(bookingStart >= newSearchStart && bookingStart <= newSearchEnd) return true; 
    if(bookingEnd >= newSearchStart && bookingEnd <= newSearchEnd) return true;
    return false;
  })
  return bookings.length === 0
}




customerRouter.post("/signup", async (req, res) => {
  // check the user
  const parsedData = customerSignupSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }

  try {

    const folder = await createFolder(parsedData.data.name+" "+parsedData.data.contact, "customer");
    if(!folder.success || !folder.folderId) {
      res.status(400).json({ message: "Folder creation failed", error: folder.error });
      return;
    }

    let customer = await client.customer.findFirst({
      where: {
        contact: parsedData.data.contact,
        name: parsedData.data.name
      },
    });

    if(customer) {
      res.status(400).json({ message: "Customer already exist" });
      return;
    }

    customer = await client.customer.create({
      data: {
        name: parsedData.data.name,
        contact: parsedData.data.contact,
        password: parsedData.data.password,
        folderId: folder.folderId,
        joiningDate: formatDate(new Date()),
        email: parsedData.data.email
      },
    });
    
    const token = jwt.sign(
      {
        userId: customer.id,
        name: customer.name,
      },
      JWT_PASSWORD,
    );

    res.json({
      message: "User created successfully",
      token,
      id: customer.id,
      name: customer.name,
      customer
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.post("/signin", async (req, res) => {
  const parsedData = SigninSchema.safeParse(req.body);
  if (!parsedData.success) {
    res.status(403).json({ message: "Wrong Input type" });
    console.log("error",parsedData.error);
    return;
  }

  try {
    let customer;
    if(parsedData.data.provider === "google"){
      customer = await client.customer.findFirst({
        where: {
          email: parsedData.data.username,
        },
      });
      if (!customer) {
        const folder = await createFolder(parsedData.data.name+" "+parsedData.data.username.split("@")[0], "customer");
        if(!folder.success || !folder.folderId) {
          res.status(400).json({ message: "Folder creation failed", error: folder.error });
          return;
        }
        customer = await client.customer.create({
          data: {
            name: parsedData.data.name || "",
            email: parsedData.data.username,
            password: parsedData.data.password,
            imageUrl: parsedData.data.imageUrl,
            joiningDate: formatDate(new Date()),
            provider: parsedData.data.provider,
            folderId: folder.folderId,
          },
        });

      }
    }else {
      if(parsedData.data.username.includes("@")){
        customer = await client.customer.findFirst({
          where: {
            email: parsedData.data.username,
          },
        });
      }else {
        customer = await client.customer.findFirst({
          where: {
            contact: parsedData.data.username,
          },
        });
      }
      if (!customer) {
        res.status(403).json({ message: "Invalid username" });
        return;
      }
      if(!customer.password || customer.password === ""){
        await client.customer.update({
          where: {
            id: customer.id
          },
          data:{
            password: parsedData.data.password
          }
        })
      }else {
        if (customer.password !== parsedData.data.password) {
          res.status(403).json({ message: "Invalid password" });
          return;
        }
      }
    }

    const token = jwt.sign(
      {
        userId: customer.id,
        name: customer.name,
      },
      JWT_PASSWORD,
    );

    res.status(200).json({
      message: "User signed in successfully",
      token,
      id: customer.id,
      name: customer.name,
      image:customer.imageUrl,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.post("/checkMail", async (req, res) => {
  try {
    const username = req.body.username;
    if(!username || typeof username !== "string") {
      res.status(400).json({ message: "Invalid username" });
      return;
    }
    let customer;
    if(username.includes("@")){
      customer = await client.customer.findFirst({
        where: {
          email: username,
        },
      });
    }else {
      customer = await client.customer.findFirst({
        where: {
          contact: username,
        },
      });
    }

    if (!customer) {
      res.status(403).json({ message: "Invalid username" });
      return;
    }

    let isPassword:boolean;
    if(customer.provider === "google"){
      isPassword = customer.password && customer.password != "" ? true : false;
    }
    else {
      isPassword = true;
    }

    res.status(200).json({
      message: "Username is correct",
      isPassword,
      customer
    })
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.post("/", middleware, async (req, res) => {
  const parsedData = CustomerCreateSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }
  try {
    const customer = await client.customer.findFirst({
      where: {
        name: parsedData.data.name,
        contact: parsedData.data.contact,
      },
    });

    if (customer) {
      res.status(400).json({ message: "Customer already exist" });
      return;
    }

    const newCustomer = await client.customer.create({
      data: {
        name: parsedData.data.name,
        contact: parsedData.data.contact,
        address: parsedData.data.address,
        folderId: parsedData.data.folderId,
        email: parsedData.data.email,
        joiningDate: formatDate(parsedData.data.joiningDate),
        kycStatus: parsedData.data.address && parsedData.data.documents ? "verified" : "pending"
      },
      include: {
        documents: true,
      },
    });

    const documents: Document[] = [];
    if (parsedData.data.documents) {
      for (const document of parsedData.data.documents) {
        const doc = await client.document.create({
          data: {
            name: document.name,
            url: document.url,
            type: document.type,
            customerId: newCustomer.id,
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

    res.json({
      message: "Customer updated successfully",
      id: newCustomer.id,
      documents,
    });

    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.post("/booking", middleware, async (req, res) => {
  const parsedData = CustomerBookingSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }
  try {

    const user  = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    const car = await client.car.findFirst({
      where: {
        id: parsedData.data.carId,
      },
      include: {
        bookings: true
      }
    })

    if(!car  || car.status === "pause") {
      res.status(400).json({message: "Invalid car id"})
      return;
    }

    const newBookingId = await generateBookingId();
    const currDate = new Date();
    const unixTimeStamp = Math.floor(currDate.getTime() / 1000);
    const folder = await createFolder(
      newBookingId + " " + unixTimeStamp,
      "booking",
    );

    if (!folder.folderId || folder.error) {
      res.status(400).json({
        message: "Failed to create folder",
        error: folder.error,
      });
      return;
    }

    

    const booking = await client.booking.create({
      data: {
        id: newBookingId,
        startDate: formatDate(parsedData.data.startDate),
        endDate: formatDate(parsedData.data.endDate),
        startTime: parsedData.data.startTime,
        endTime: parsedData.data.endTime,
        allDay: parsedData.data.allDay,
        carId: parsedData.data.carId,
        dailyRentalPrice: car.price,
        totalEarnings: parsedData.data.totalAmount,
        userId: car.userId,
        status: "Requested",
        customerId: user.id,
        bookingFolderId: folder.folderId,
        type: parsedData.data.type,
        otp: generateOTP()
      },
    });

    res.json({
      message: "Booking created successfully",
      bookingId: booking.id,
      folderId: folder.folderId,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.post('/booking-payment/:bookingId',middleware,async (req,res) => {
  try{
    const {advancePayment,paymentMethod,status} = req.body;
    const {bookingId} = req.params;

    if(!bookingId) {
      res.status(400).json({message: "Booking id is required"})
      return;
    }

    if(!advancePayment || !paymentMethod) {
      res.status(400).json({message: "Invalid input data"})
      return;
    }
    const user  = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })

    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }

    const booking = await client.booking.findFirst({
      where: {
        id: bookingId,
        customerId: user.id
      }
    })

    if(!booking) {
      res.status(400).json({message: "Invalid booking id"})
      return;
    }

    await client.booking.update({
      where: {
        id: bookingId,
      },
      data:{
        paymentMethod: paymentMethod,
        advancePayment: advancePayment,
        status: status
      }
    })

    res.json({
      message: "Booking payment updated successfully",
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.post('/favorite-car/:carId', middleware,async (req,res) => {
  try{
    const user  = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })

    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }

    const car = await client.car.findFirst({
      where: {
        id: parseInt(req.params.carId),
      }
    });

    if(!car) {
      res.status(400).json({message: "Invalid car id"})
      return;
    }

    await client.favoriteCar.create({
      data: {
        userId: user.id,
        carId: car.id
      }
    })

    res.json({
      message: "Favorite car added successfully",
      carId: car.id,
      carName: car.brand + " " + car.model
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.post('/update-kyc',async (req,res) => {
  try{
    const customers = await client.customer.findMany({
      include: {
        documents: true
      }
    });

    for(const customer of customers){
      if(customer.address !== null && customer.documents.length !== 0 && customer.email=== null) {
        await client.customer.update({
          where: {
            id: customer.id
          },
          data:{
            kycStatus: "under review"
          }
        })
      }
    }

    res.json({
      message: "KYC status updated successfully"
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
});

customerRouter.get("/all", middleware, async (req, res) => {
  try {
    const customers = await client.customer.findMany({
      include: {
        documents: true,
      },
    });
    res.json({
      message: "Customer fetched successfully",
      customers: customers,
    });
    return;
  } catch (e) {
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/me", middleware, async (req, res) => {
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: req.userId,
      },
      include:{
        documents:true
      }
    });

    if (!customer) {
      res.status(404).json({ message: "Customer not found" });
      return;
    }

    const formatedCustomer = {
      id: customer.id,
      name: customer.name,
      contact: customer.contact || undefined,
      address: customer.address || undefined,
      email: customer.email || undefined,
      folderId: customer.folderId,
      documents: customer.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        url: doc.url,
        type: doc.type,
        docType: doc.docType
      }))
    }
    res.json({
      message: "Customer fetched successfully",
      id: customer.id,
      name: customer.name,
      imageUrl: customer.imageUrl,
      customer:formatedCustomer,
      isPassword: customer.password && customer.password != "" ? true : false,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/kyc-status", middleware, async (req, res) => {
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: req.userId,
      },
      include:{
        documents:true
      }
    });

    if (!customer) {
      res.status(404).json({ message: "Customer not found" });
      return;
    }
    res.json({
      message: "Customer fetched successfully",
      kycStatus: customer.kycStatus,
      approvedFlag:customer.approvedFlag, 
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/check-otp/:id", middleware, async (req, res) => {
  try {
    if(!req.query.otp) {
      res.status(400).json({message: "OTP is required"})
      return;
    }
    const user = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    });
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    const booking = await client.booking.findFirst({
      where: {
        id: req.params.id,
      },
    });
    if (!booking) {
      res.status(400).json({ message: "Booking not found" });
      return;
    }
    res.json({
      message: "OTP checked successfully",
      isCorrect: booking.otp === req.query.otp,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/car/all",  async (req, res) => {
  try {

    const cars = await client.car.findMany({
      include: {
        bookings: true,
        favoriteCars: true,
        photos:true
      },
      where: {
        status: "active"
      }
    });

    
    const formatedCars = cars.map((car) => {
      return {
        id: car.id,
        brand: car.brand,
        model: car.model,
        imageUrl: car.imageUrl,
        price: car.price,
        seats: car.seats,
        fuel: car.fuel,
        gear: car.gear,
        favorite: car.favoriteCars.filter(favorite => favorite.userId === req.userId).length > 0,
        photos: car.photos.map(photo => photo.url)
      };
    });

    res.json({
      message: "Cars fetched successfully",
      cars: formatedCars,
    });
    return;
  } catch (e) {
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/car/:id", async (req, res) => {
  try {
    const car = await client.car.findFirst({
      where: {
        id: parseInt(req.params.id),
        status: "active"
      },
      include: {
        favoriteCars: true,
        photos: true
      },
    });
    if (!car) {
      res.status(404).json({ message: "Car not found" });
      return;
    }

    const formatedCars = {
      id: car.id,
      brand: car.brand,
      model: car.model,
      price: car.price,
      seats: car.seats,
      fuel: car.fuel,
      gear: car.gear,
      favorite: car.favoriteCars.filter(favorite => favorite.userId === req.userId).length > 0,
      photos: car.photos.map(photo => photo.url),
    };
    res.json({
      message: "Car fetched successfully",
      car: formatedCars,
    });
    return;
  } catch (e) {
    console.error("Erros:", e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/booking/all",middleware, async (req, res) => {
  try {
      const bookings = await client.booking.findMany({
        where: {
            customerId: req.userId,
        },
        include: {
          car: {
            include:{
              photos:true
            }
          },
        },
        orderBy: [{ id: "asc" }],
      });
      const formatedBookings = bookings.map((booking) => {
        return {
          id: booking.id,
          carId: booking.car.id,
          carImageUrl: booking.car.photos[0].url,
          carName: booking.car.brand + " " + booking.car.model,
          carPlateNumber: booking.car.plateNumber,
          start: booking.startDate,
          end: booking.endDate,
          startTime: booking.startTime,
          endTime: booking.endTime,
          status: booking.status,
          price: booking.totalEarnings,
          type: booking.type,
        };
      });
      res.json({
        message: "Bookings fetched successfully",
        bookings: formatedBookings,
      });
      return;
    } catch (e) {
      console.error(e);
      res.status(400).json({
        message: "Internal server error",
        error: e,
      });
      return;
    }
});

customerRouter.get("/filtered-cars",async (req,res) => {
  const parsedData = FilterCarsSchema.safeParse(req.query);
  if(!parsedData.success) {
    res.status(400).json({message: "Wrong Input type"})
    return;
  }
  try{
    
    const cars = await client.car.findMany({
      include: {
        bookings: true,
        favoriteCars:true,
        photos:true
      }
    });
    const searchStart = combiningDateTime(parsedData.data.startDate, parsedData.data.startTime);
    const searchEnd = combiningDateTime(parsedData.data.endDate, parsedData.data.endTime);
    const filteredCars = cars.filter(car => {
          return isCarAvailable(car,searchStart,searchEnd)
      });

    const formatedCars = filteredCars.map((car) => {
      return {
        id: car.id,
        brand: car.brand,
        model: car.model,
        imageUrl: car.imageUrl,
        price: car.price,
        seats: car.seats,
        fuel: car.fuel,
        favorite: car.favoriteCars.filter(favorite => favorite.userId === req.userId).length > 0,
        photos: car.photos.map(photo => photo.url),
        gear:car.gear,
        plateNumber: parsedData.data.user==="admin" ? car.plateNumber : undefined
      };
    });

    res.json({
      message: "Cars fetched successfully",
      cars: formatedCars,
    });
    return;
  }
  catch(err){
    console.error(err);
    res.json({message:"Internal Server Error"});
  }

})

customerRouter.get('/favorite-cars',middleware, async (req, res)=>{
  try{
    const user = await client.customer.findFirst({
      where: {
        id: req.userId,
      },
      include: {
        favoriteCars: {
          include: {
            car: {
              include: {
                photos: true
              },
              
            },
          },
        },
      },
    });
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    
    const favoriteCars = user.favoriteCars
    .filter(car => car.car.status !== "pause") 
    .map((car) => {
      return {
        id: car.car.id,
        favorite:true,
        brand: car.car.brand,
        model: car.car.model,
        imageUrl: car.car.imageUrl,
        price: car.car.price,
        seats: car.car.seats,
        fuel: car.car.fuel,
        photos: car.car.photos.map(photo => photo.url),
        gear:car.car.gear
      };
    });

    res.json({
      message: "Favorite cars fetched successfully",
      favoriteCars,
    });
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.put('/me',middleware, async (req, res) => {
  const parsedData = CustomerProfileSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: req.userId,
      },
    });

    if (!customer) {
      res.status(400).json({ message: "Customer not found" });
      return;
    }

    await client.customer.update({
      where: {
        id: req.userId,
      },
      data: {
        ...parsedData.data,
      },
    });

    res.json({
      message: "Customer updated successfully",
      id: customer.id,
      name: customer.name,
      contact: customer.contact,
      customer: customer.imageUrl
    });
    return;

  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.put("/set-joining-date/all",middleware, async (req, res) => {
  try {
    const bookings = await client.booking.findMany({
      include: {
        customer: true,
      },
    });

    const customers = []
    for (const booking of bookings) {
      const customer = booking.customer;
      const joiningDate = new Date(customer.joiningDate);
      const startDate = new Date(booking.startDate);
      if (joiningDate.getFullYear() === 2026){
        customers.push(customer);
        await client.customer.update({
          where: {
            id: customer.id,
          },
          data: {
            joiningDate: formatDate(startDate),
          },
        });
      }
    }

    res.json({
      message: "Customer Joining date updated successfully",
      customers
    });
    return;
  } catch (e) {
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.put('/kyc-approve-flag',middleware, async (req,res) => {
  try{
    const customer = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })
    if(!customer) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    await client.customer.update({
      where: {
        id: customer.id
      },
      data:{
        approvedFlag: false
      }
    })
    res.json({
      message: "KYC flag verfied successfully"
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.put("/verify-kyc/:id",middleware, async (req,res) => {
  try{
    const user = await client.user.findFirst({
      where: {
        id: req.userId,
      }
    })
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }

    const customer = await client.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
      }
    })
    if(!customer) {
      res.status(400).json({message: "Invalid customer id"})
      return;
    }

    await client.customer.update({
      where: {
        id: customer.id
      },
      data:{
        kycStatus: "verified",
        approvedFlag:true
      }
    })
    
    res.json({
      message: "KYC status updated successfully"
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.put('/booking-cancel/:id',middleware, async (req,res) => {  
  try{
    const booking = await client.booking.findFirst({
      where: {
        id: req.params.id,
      }
    })
    if(!booking) {
      res.status(400).json({message: "Booking not found"})
      return;
    }
    await client.booking.update({
      where: {
        id: req.params.id,
      },
      data:{
        status: "Cancelled",
        cancelledBy: "guest"
      }
    })
    res.json({
      message: "Booking cancelled successfully",
      BookingId: req.params.id,
    });
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.put('/me/update-password',middleware, async (req,res) => {
  const parsedData = CustomerUpdatePasswordSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }
  try{
    const customer = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })
    if(!customer) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    if(customer.password  && (!parsedData.data.currPassword || customer.password !== parsedData.data.currPassword)) {
      res.status(403).json({message: "Invalid current password"})
      return;
    }
    await client.customer.update({
      where: {
        id: customer.id
      },
      data:{
        password: parsedData.data.newPassword
      }
    })
    res.json({
      message: "Password updated successfully"
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})

customerRouter.put("/:id", middleware, async (req, res) => {
  const parsedData = CustomerUpdateSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        documents: true,
      },
    });

    if (!customer) {
      res.status(400).json({ message: "Customer not found" });
      return;
    }

    if(parsedData.data.deletedPhotos) {
      for (const photo of parsedData.data.deletedPhotos) {
        await client.document.delete({
          where: {
            id: photo.id
          }
        })
      }
      await deleteMultipleFiles(parsedData.data.deletedPhotos.map((document) => document.url));
    }

    const documents = []
    if (parsedData.data.documents) {
      for (const document of parsedData.data.documents) {
        const doc = await client.document.create({
            data: {
              name: document.name,
              url: document.url,
              type: document.type,
              customerId: customer.id,
              docType: document.docType || "others"
            },
          });
        documents.push(doc);
      }
    }

    await client.customer.update({
      data: {
        name: parsedData.data.name,
        contact: parsedData.data.contact,
        address: parsedData.data.address,
        folderId: parsedData.data.folderId,
        email: parsedData.data.email,
        joiningDate: parsedData.data.joiningDate && formatDate(parsedData.data.joiningDate),
        kycStatus: parsedData.data.kycStatus
      },
      where: {
        id: customer.id,
      }
    });

    res.json({
      message: "Customer updated successfully",
      CustomerId: customer.id,
      documents
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.delete("/:id", middleware, async (req, res) => {
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        documents: true,
        bookings: true,
      },
    });

    if (!customer) {
      res.status(400).json({ message: "Customer not found" });
      return;
    }

    if (customer.bookings.length > 0) {
      res
        .status(400)
        .json({ message: "Customer has bookings, cannot be deleted" });
      return;
    }

    await client.document.deleteMany({
      where: {
        customerId: customer.id,
      },
    });

    if (customer.documents.length > 0) {
      await deleteMultipleFiles(
        customer.documents.map((document) => document.url),
      );
    }
    await deleteFolder(customer.folderId);

    await client.customer.delete({
      where: {
        id: customer.id,
      },
    });

    res.json({
      message: "Customer deleted successfully",
      CustomerId: customer.id,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.delete("/:id/documents/all", middleware, async (req, res) => {
  const { id } = req.params;
  try {
    const customer = await client.customer.findFirst({
      where: {
        id: parseInt(id),
      },
      include: {
        documents: true,
      },
    });
    if (!customer) {
      res.status(400).json({ message: "Customer not found" });
      return;
    }
    await client.document.deleteMany({
      where: {
        customerId: parseInt(id),
      },
    });

    if (customer.documents.length > 0) {
      await deleteMultipleFiles(
        customer.documents.map((document) => document.url),
      );
    }

    res.status(200).json({
      message: "Document deleted successfully",
      BookingId: id,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.delete("/document/:id", middleware, async (req, res) => {
  try {
    if(req.query.role === "customer"){
      const user = await client.customer.findFirst({
        where: {
          id: req.userId,
        }
      });
      if(!user) {
        res.status(401).json({message: "Unauthorized"})
        return;
      }
    }else {
      const user = await client.user.findFirst({
        where: {
          id: req.userId,
        }
      });
      if(!user) {
        res.status(401).json({message: "Unauthorized"})
        return;
      }
    }
    const document = await client.document.delete({
      where: {
        id: parseInt(req.params.id),
      },
    });
    if (document.url) {
      await deleteFile(document.url);
    }
    res.status(200).json({
      message: "Document deleted successfully",
      BookingId: req.params.id,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.delete('/favorite-car/:carId',middleware, async(req,res) => {
  try{
    const user  = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })

    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }

    const favorite = await client.favoriteCar.findFirst({
      where: {
        carId: parseInt(req.params.carId),
        userId: user.id
      }
    });

    if(!favorite) {
      res.status(400).json({message: "Invalid car id"})
      return;
    }

    await client.favoriteCar.delete({
      where: {
        id: favorite.id
      }
    })

    res.json({
      message: "Favorite car removed successfully",
    })
    return;
  }catch(err){
    console.error(err);
    res.json({message:"Internal server error",
      error:err
    })
    return;
  }
})






