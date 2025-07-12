from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import pandas as pd

from ml_models.model_utils import (
    get_sales_forecast,
    check_stockout,
    optimize_delivery,
)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Input models
class SalesRecord(BaseModel):
    Date: str
    Weekly_Sales: float

class ForecastRequest(BaseModel):
    data: List[SalesRecord]
    days: int

class StockoutRequest(BaseModel):
    temp: float
    fuel: float
    cpi: float
    unemp: float

class OptimizeRequest(BaseModel):
    coords: List[List[float]]

# Routes
@app.post("/api/inventory/forecast")
def forecast_sales(req: ForecastRequest):
    df = pd.DataFrame([r.dict() for r in req.data])
    result = get_sales_forecast(df, days=req.days)
    return {"forecast": result}

@app.post("/api/inventory/stockout")
def stockout_alert(req: StockoutRequest):
    result = check_stockout(req.temp, req.fuel, req.cpi, req.unemp)
    return {"alert": result}

@app.post("/api/routes/optimize")
def optimize_routes(req: OptimizeRequest):
    result = optimize_delivery(req.coords)
    return result

@app.get("/")
def root():
    return {"message": "🚀 SmartFlow API is running!"}
