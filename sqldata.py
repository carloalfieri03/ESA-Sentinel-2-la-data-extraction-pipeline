import json
import pandas as pd

target_images = {
    "B02": "10m", "B03": "10m", "B04": "10m", 
    "B08": "10m", "TCI": "10m", "SCL": "20m"}
# 1. Load the local raw data
with open("raw_sentinel_data.json", "r") as f:
    data = json.load(f)

# 2. Extract only what we need for the SQL Relational Schema
rows = []
rows_images= []
for item in data:
    props = item['properties']
    stats = props.get('statistics', {})
    rows.append ({

# dati sul satellite che ha acquisito immagini ed ente che le ha processate
        "acquisition_id": item.get('id'),
        "bbox": item.get('bbox'),
        "date": props.get('datetime'),
        "platform": props.get('platform'),
        "gsd": props.get('gsd'),
        "grid_code":props.get('grid:code'),
        'instruments': props.get('instruments'),
        'datatake_id':props.get('eopf:datatake_id'),
        'processing_facility':props.get('processing:facility'),

 # land data
        "water_pct": stats.get('water', 0.0),
        "vegetation_pct": stats.get('vegetation', 0.0),
        "dark_area_pct": stats.get('dark_area', 0.0),
        "not_vegetated_pct": stats.get('not_vegetated', 0.0),
        "nodata_pct": stats.get('nodata', 0.0),
        "unclassified": stats.get('unclassified',0.0),
        "snow_pct": item['properties'].get('eo:snow_cover', 0),


 # clouds data      
        "high_proba_clouds": stats.get('high_proba_clouds', 0.0),
        "medium_proba_clouds": stats.get('medium_proba_clouds', 0.0),
        "cloud_shadow": stats.get('cloud_shadow', 0.0),
        
## acquisition info
        "thin_cirrus": stats.get('thin_cirrus', 0.0),
        "view_azimuth": props.get('view:sun_azimuth', 0),
        "view_sun_elevation": props.get('view:sun_elevation', 0),
        "view_incidence_angle": props.get('view:incidence_angle', 0),
        "sun_elevation": props.get('view:sun_elevation', 0),
        "orbit_state": props.get('sat:orbit_state', 'descending') })

    for band, res in target_images.items():
        # Match the band name (e.g., B04_10m)
            asset_key = f"{band}_{res}" if band != "SCL" and band != "TCI" else band

            asset_obj = item.get('assets', {}).get(asset_key, {})
            # Navigate to the HTTPS link we discussed
            file_url = asset_obj.get('alternate', {}).get('https', {}).get('href')

            if file_url:
                rows_images.append({
                    "acquisition_id": item.get('id'),
                    "band_name": band,
                    "resolution": res,
                    "file_url": file_url
                })


#  CSV
df = pd.DataFrame(rows)
df_acq = pd.DataFrame(rows_images)
df.to_csv("mysql_import.csv", index=False)
df_acq.to_csv("mysql_images.csv", index=False)
print("CSV generated!")