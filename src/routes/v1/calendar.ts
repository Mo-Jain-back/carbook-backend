import { Router } from "express";
import { CalendarUpdateSchema } from "../../types";
import { middleware } from "../../middleware";
import client from "../../store/src";
import { formatDate } from "./booking";

export const calendarRouter = Router();

interface Booking {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  startTime: string;
  endTime: string;
  color: string;
  allDay: boolean;
  customerName: string;
  customerContact: string | null;
  carId: number;
  carName: string;
  isAdmin: boolean;
}

calendarRouter.get("/all", middleware, async (req, res) => {
  try {
    const user  = await client.user.findFirst({
      where: {
        id: req.userId,
      },
    });
    if (!user) {
       res.status(401).json({ message: "Unauthorized" });
       return;
    }
    const bookings = await client.booking.findMany({
      include: {
        car: true,
        customer: true,
      },
      orderBy: [{ startDate: "asc" }, { startTime: "asc" }]
    });
    const formatedBookings:Booking[] = [];
    bookings.forEach((booking) => {
      if(booking.status.toLocaleLowerCase() === "completed") return;
      const newBook =  {
                id: booking.id,
                startDate: booking.startDate,
                endDate: booking.endDate,
                status: booking.status,
                startTime: booking.startTime,
                endTime: booking.endTime,
                color: booking.car.colorOfBooking,
                allDay: booking.allDay,
                customerName: booking.customer.name,
                customerContact: booking.customer.contact,
                carId: booking.carId,
                carName: booking.car.brand + " " + booking.car.model,
                isAdmin: req.userId === booking.userId
              };
      formatedBookings.push(newBook);
    });
    res.json({
      message: "Bookings fetched successfully",
      bookings: formatedBookings,
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

calendarRouter.put("/:id", middleware, async (req, res) => {
  const parsedData = CalendarUpdateSchema.safeParse(req.body);
  if (!parsedData.success) {
    res
      .status(400)
      .json({ message: "Wrong Input type", error: parsedData.error });
    return;
  }

  try {
    const booking = await client.booking.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
      include: {
        car: true,
      },
    });

    if (!booking) {
      res.status(400).json({ message: "Booking not found" });
      return;
    }

    const updateData: Record<string, any> = {};

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

    await client.booking.update({
      data: updateData,
      where: {
        id: req.params.id,
      },
    });

    if (parsedData.data.customerName) {
      await client.customer.update({
        where: {
          id: booking.customerId,
        },
        data: {
          name: parsedData.data.customerName,
        },
      });
    }

    res.json({
      message: "Booking updated successfully",
      BookingId: booking.id,
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

calendarRouter.delete("/:id", middleware, async (req, res) => {
  try {
    const booking = await client.booking.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
      include: {
        car: true,
      },
    });

    if (!booking) {
      res.status(400).json({ message: "Booking not found" });
      return;
    }

    await client.carImages.deleteMany({
      where: {
        bookingId: req.params.id,
      },
    });

    await client.booking.delete({
      where: {
        id: req.params.id,
      },
    });

    if(booking.status.toLocaleLowerCase() !== "completed" && booking.totalEarnings) {
      await client.car.update({
        where: {
          id: booking.carId,
          userId: req.userId!,
        },
        data: {
          totalEarnings: {
            decrement: booking.totalEarnings,
          },
        },
      });
    };

    res.json({
      message: "Booking deleted successfully",
      BookingId: booking.id,
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

calendarRouter.put("/change-color/:id", middleware, async (req, res) => {
  try {
    const car = await client.car.findFirst({
      where: {
        id: parseInt(req.params.id),
        userId: req.userId!,
      },
    });

    if (!car) {
      res.status(400).json({ message: "Car not found" });
      return;
    }

    await client.car.update({
      data: {
        colorOfBooking: req.body.color,
      },
      where: {
        id: parseInt(req.params.id),
      },
    });

    res.json({
      message: "Booking color updated successfully",
      CarId: car.id,
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
