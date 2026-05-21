import json
import pandas as pd
from datetime import datetime

target_images = {
    "B02": "10m", "B03": "10m", "B04": "10m", 
    "B08": "10m", "TCI": "10m", "SCL": "20m"}

def get_season(month):   
    if month in (12, 1, 2): return "Winter"    
    if month in (3, 4, 5):  return "Spring"    
    if month in (6, 7, 8):  return "Summer"    
    return "Autumn"

# open the raw json
with open("data/raw_sentinel_data.json", "r") as f:
    data = json.load(f)
## target json attributes to extract
rows = []
rows_images= []
for item in data:
    props = item['properties']
    stats = props.get('statistics', {})
    
    raw_date = props.get('datetime')
    acq_date = datetime.fromisoformat(raw_date.replace('Z', '+00:00')) # date formatting
    month = acq_date.month

    rows.append ({

# satellite acquisitons data
        "acquisition_id": item.get('id'),
        "bbox": item.get('bbox'),       
        "acq_month": month, 
        "acq_year": acq_date.year,              
        "acq_season": get_season(month), 
        "acquisition_date": props.get('datetime'), 
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
    
    # Group all image bands for this single acquisition
    image_document = {
        "acquisition_id": item.get('id'),
        "acquisition_date": props.get('datetime'),
        "images": [] 
    }

    for band, res in target_images.items():
        asset_key = f"{band}_{res}" if band not in ["SCL", "TCI"] else band
        asset_obj = item.get('assets', {}).get(asset_key, {})
        file_url = asset_obj.get('alternate', {}).get('https', {}).get('href')

        if file_url:
            image_document["images"].append({
                "band_name": band,
                "resolution": res,
                "file_url": file_url
            })

    if image_document["images"]:
        rows_images.append(image_document)



# schema for the mongo collections 

land_char=[
    "acquisition_id", "acq_month", "acq_year", "acq_season", "bbox", 
    "grid_code",  "water_pct", "vegetation_pct", "dark_area_pct", 
    "not_vegetated_pct", "snow_pct"]

acquisitions=[ "acquisition_id", "acquisition_date","acq_year", "acq_season", "bbox", "platform", "gsd", 
    "grid_code", "instruments", "datatake_id", "processing_facility", "nodata_pct", "unclassified",
    "high_proba_clouds", "medium_proba_clouds",  "cloud_shadow", "thin_cirrus", 
      "view_azimuth", "view_sun_elevation", 
    "view_incidence_angle", "sun_elevation", "orbit_state"]

images=[ "acquisition_id", "acquisition_date", "images" ]     
     
def export_to_ndjson(filename, data_list, target_columns):
    with open(filename, "w") as f:
        for row in data_list:
            # dictionary containing keys defined in target
            filtered_doc = {key: row.get(key) for key in target_columns}
            
            # json.dumps converts the single dict to a string 
            f.write(json.dumps(filtered_doc) + "\n") # \n is for NDJSON, one line one json object, more memory efficient. One line one document

# files 
export_to_ndjson("data/land_char.ndjson", rows, land_char)
export_to_ndjson("data/acquisitions.ndjson", rows, acquisitions)
export_to_ndjson("data/images.ndjson", rows_images, images)

print("Successfully created three NDJSON files!")

print("NDJON generated")