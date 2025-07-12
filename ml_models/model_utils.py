import pandas as pd
import joblib
from prophet import Prophet
from sklearn.ensemble import RandomForestClassifier
from sklearn.cluster import KMeans
import json

# 1. Forecast Sales using Prophet
def get_sales_forecast(df, days=7):
    df = df.rename(columns={"Date": "ds", "Weekly_Sales": "y"})[['ds', 'y']].dropna()
    df['ds'] = pd.to_datetime(df['ds'])

    model = Prophet()
    model.fit(df)

    future = model.make_future_dataframe(periods=days, freq='W')
    forecast = model.predict(future)
    forecast = forecast[['ds', 'yhat']].tail(days)

    # ✅ Return clean list of dicts
    return [
        {"date": row["ds"].strftime("%Y-%m-%d"), "predicted_sales": round(row["yhat"], 2)}
        for _, row in forecast.iterrows()
    ]

# 2. Predict Stockout
def check_stockout(temp, fuel, cpi, unemp):
    clf = joblib.load("outputs/stockout_classifier.pkl")
    pred = clf.predict([[temp, fuel, cpi, unemp]])
    return "⚠️ ALERT: Likely stockout!" if pred[0] == 1 else "✅ All Good"

# 3. Optimize Delivery via Clustering
def optimize_delivery(coords_list):
    coords = pd.DataFrame(coords_list, columns=["lat", "lon"])
    model = KMeans(n_clusters=2, random_state=42)
    labels = model.fit_predict(coords)
    coords["cluster"] = labels

    cluster_dict = {}
    for label in coords["cluster"].unique():
        cluster_data = coords[coords["cluster"] == label][["lat", "lon"]]
        cluster_dict[str(label)] = cluster_data.to_dict(orient="records")

    return {
        "clusters": cluster_dict,
        "optimized_path": coords[["lat", "lon"]].values.tolist(),
        "fuel_saved": round((len(coords) - len(set(labels))) * 0.5, 2)  # mock value
    }
