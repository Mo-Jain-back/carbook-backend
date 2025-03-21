import { Router } from "express";
import client from "../../store/src";
import { middleware } from "../../middleware";
import { CustomerBookingSchema, CustomerCreateSchema, CustomerProfileSchema, customerSignupSchema, CustomerUpdateSchema, FilterCarsSchema, SigninSchema } from "../../types";
import { createFolder, deleteFolder } from "./folder";
import { deleteFile, deleteMultipleFiles } from "./delete";
import jwt from "jsonwebtoken";
import { JWT_PASSWORD } from "../../config";
import { generateBookingId } from "./booking";

interface Document {
  id: number;
  name: string;
  url: string;
  type: string;
}

export const customerRouter = Router();

function timeToMinutes(time:string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function combiningDateTime(date: string, time: string) {
  console.log("date",date);
  console.log("time",time);
  const dateTime = new Date(date);
  const [hour, minute,second] = time.split(":").map(Number);
  return dateTime.setHours(hour, minute, 0, 0);
}

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
        joiningDate: new Date().toLocaleDateString("en-US"),
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
    return;
  }

  try {
    const customer = await client.customer.findFirst({
      where: {
        contact: parsedData.data.username,
        password: parsedData.data.password,
      },
    });

    if (!customer) {
      res.status(403).json({ message: "Invalid username or password" });
      return;
    }

    const token = jwt.sign(
      {
        userId: customer.id,
        name: customer.name,
      },
      JWT_PASSWORD,
    );

    res.json({
      message: "User signed in successfully",
      token,
      id: customer.id,
      name: customer.name,
    });
    return;
  } catch (e) {
    console.log(e);
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
        joiningDate: parsedData.data.joiningDate,
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

    const car = await client.car.findFirst({
      where: {
        id: parsedData.data.carId,
      }
    })

    if(!car) {
      res.status(400).json({message: "Invalid car id"})
      return;
    }

    const booking = await client.booking.create({
      data: {
        id: newBookingId,
        startDate: parsedData.data.startDate,
        endDate: parsedData.data.endDate,
        startTime: parsedData.data.startTime,
        endTime: parsedData.data.endTime,
        allDay: parsedData.data.allDay,
        carId: parsedData.data.carId,
        dailyRentalPrice: car.price,
        totalEarnings: parsedData.data.totalAmount,
        userId: car.userId,
        status: "Upcoming",
        customerId: user.id,
        bookingFolderId: folder.folderId,
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
    res.json({
      message: "Customer fetched successfully",
      id: customer.id,
      name: customer.name,
      imageUrl: customer.imageUrl,
      customer
    });
    return;
  } catch (e) {
    console.log(e);
    res.status(400).json({
      message: "Internal server error",
      error: e,
    });
    return;
  }
});

customerRouter.get("/car/all", middleware, async (req, res) => {
  try {
    const user = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    });
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }

    const cars = await client.car.findMany({
      include: {
        bookings: true,
        favoriteCars: true,
      },
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
        favorite: car.favoriteCars.filter(favorite => favorite.userId === user.id).length > 0
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

customerRouter.get("/filtered-cars",middleware,async (req,res) => {
  const parsedData = FilterCarsSchema.safeParse(req.query);
  if(!parsedData.success) {
    res.status(400).json({message: "Wrong Input type"})
    return;
  }
  try{
    const user = await client.customer.findFirst({
      where: {
        id: req.userId,
      }
    })
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    const cars = await client.car.findMany({
      include: {
        bookings: true,
        favoriteCars:true
      }
    });
    const searchStart = combiningDateTime(parsedData.data.startDate, parsedData.data.startTime);
    const searchEnd = combiningDateTime(parsedData.data.endDate, parsedData.data.endTime);
    const filteredCars = cars.filter(car => {
          const bookings = car.bookings.filter(booking => {
            if(booking.status.toLowerCase() === "completed") return false;
            const bookingStart = combiningDateTime(booking.startDate, booking.startTime);
            const bookingEnd = combiningDateTime(booking.endDate, booking.endTime);
            if(searchStart >= bookingStart && searchStart <= bookingEnd) return true;
            if(searchEnd >= bookingStart && searchEnd <= bookingEnd) return true;
            return false;
          })
          return bookings.length === 0
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
        favorite: car.favoriteCars.filter(favorite => favorite.userId === user.id).length > 0
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

    if (parsedData.data.documents) {
      for (const document of parsedData.data.documents) {
        await client.document.create({
          data: {
            name: document.name,
            url: document.url,
            type: document.type,
            customerId: customer.id,
            docType: document.docType || "others"
          },
        });
      }
    }

    const updatedCustomer = await client.customer.update({
      data: {
        name: parsedData.data.name,
        contact: parsedData.data.contact,
        address: parsedData.data.address,
        folderId: parsedData.data.folderId,
        joiningDate: parsedData.data.joiningDate,
      },
      where: {
        id: customer.id,
      },
      include: {
        documents: true,
      },
    });

    const documents = updatedCustomer.documents.map((document) => {
      return {
        id: document.id,
        name: document.name,
        url: document.url,
        type: document.type,
        docType:document.docType
      };
    });

    res.json({
      message: "Customer updated successfully",
      CustomerId: customer.id,
      documents: documents,
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
      console.log("joiningDate.getFullYear()",joiningDate.getFullYear());
      const startDate = new Date(booking.startDate);
      console.log("startDate",startDate.toLocaleDateString("en-US"));
      if (joiningDate.getFullYear() === 2026){
        customers.push(customer);
        await client.customer.update({
          where: {
            id: customer.id,
          },
          data: {
            joiningDate: startDate.toLocaleDateString("en-US"),
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

customerRouter.get('/favorite-cars',middleware, async (req, res)=>{
  try{
    const user = await client.customer.findFirst({
      where: {
        id: req.userId,
      },
      include: {
        favoriteCars: {
          include: {
            car: true,
          },
        },
      },
    });
    if(!user) {
      res.status(401).json({message: "Unauthorized"})
      return;
    }
    
    const favoriteCars = user.favoriteCars.map((car) => {
      return {
        id: car.car.id,
        favorite:true,
        brand: car.car.brand,
        model: car.car.model,
        imageUrl: car.car.imageUrl,
        price: car.car.price,
        seats: car.car.seats,
        fuel: car.car.fuel
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
