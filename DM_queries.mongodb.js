// MongoDB Playground
// Use Ctrl+Space inside a snippet or a string literal to trigger completions.

// The current database to use.
use("sentinel_data");

// see the current collections in the database
db.runCommand(
   {
      listCollections: 1.0,
      nameOnly: true
   }
)

// -------------------------------------------------------------------------------------
// ---- 1st QUERY: Best months per city to acquire satellite images ----

// Create an index to instantly find all acquisitions for a specific city 
// without having to scan the entire collection.

db.acquisitions.createIndex({ "city_name": 1 });

db.acquisitions.aggregate([
  
  // 1. Filter only for Rome
  { $match: { "city_name": "Rome" } },
  
  // 2. Group by month to calculate our counts and averages
  { 
    $group: {
      // We can use the pre-extracted 'acq_month' field instead of extracting it at runtime
      _id: "$acq_month", 
      
      // Since every document in this collection is a unique acquisition, $sum acts just like COUNT(DISTINCT)
      total_historical_images: { $sum: 1 },
      
      // We use the total_obscuration field we pre-computed in the Python script!
      avg_obscuration_score: { $avg: "$clouds.total_obscuration" },
      
      // We drill down into the embedded illuminance document
      avg_sun_elevation: { $avg: "$illuminance.sun_elevation" }
    }
  },
  
  // 3. Sort: lowest obscuration first (1 = ASC), highest sun elevation second (-1 = DESC)
  { 
    $sort: { 
      avg_obscuration_score: 1, 
      avg_sun_elevation: -1 
    } 
  }
]).explain("executionStats");

// Zero $lookup (JOIN) since city_name, clouds, and illuminance data are all stored directly in the acquisitions collection!
// The total_obscuration was pre-computed in the Python script, so we don't need to do any calculations at runtime. We can just average it out directly.

// - TIME EXECUTION: executionTimeMillis: NumberInt('18') before index, NumberInt('7') after index

// Creating the index on city_name allows MongoDB to quickly find all documents related to a specific city 
// without having to scan the entire acquisitions collection, which significantly reduces the execution time of the query.

// -------------------------------------------------------------------------------------
// ---- 2nd QUERY: Seasonality index trends per city

db.land_analytics.aggregate([
  // 1. Group by both City and our pre-calculated Season
  { 
    $group: {
      _id: { 
        city_name: "$city_name", 
        season: "$acq_season" 
      },
      
      // Calculate the averages using the fields natively stored in land_analytics
      vegetation_avg: { $avg: "$vegetation_pct" },
      water_avg: { $avg: "$water_pct" },
      not_vegetated_avg: { $avg: "$not_vegetated_pct" },
      snow_avg: { $avg: "$snow_pct" }
    }
  },
  
  // 2. (Optional) Sort by city name and then season so the results are easy to read
  { 
    $sort: { 
      "_id.city_name": 1, 
      "_id.season": 1 
    } 
  }
]);

// While in the SQL version we had to perform 3 joins and the db had to calculate the season at runtime using a massive CASE WHEN block,
// in this query, we can directly group by the city_name and the season since both fields were 
// pre-calculated in the Python script and stored directly in the land_analytics collection.
// We can calculate the averages directly from the land_analytics collection without needing to do any 
// joins to get the vegetation_pct, water_pct, etc. fields since they are all stored directly in that collection.

// --------------------------------------------------------------------------------------
// ---- 3rd QUERY: Data loss events

// ---- 3rd QUERY: Data loss events ----

db.acquisitions.aggregate([
  // The initial $match for the year has been removed.
  
  // 1. Group by Year, Month, and Platform across the entire dataset
  { 
    $group: {
      _id: { 
        acq_year: "$acq_year", 
        acq_month: "$acq_month", 
        platform: "$platform" 
      },
      avg_monthly_data_loss: { $avg: "$nodata_pct" },
      max_data_loss: { $max: "$nodata_pct" }
    }
  },
  
  // 2. We use $expr to compare the max and average data loss directly in the $match stage, without needing to do any calculations at runtime since both values are already pre-computed in the grouping stage.
  // And we use $gt to filter only for those groups where the difference between max and average data loss is greater than 35 percentage points.
  { 
    $match: { 
      $expr: { 
        $gt: [
          { $subtract: ["$max_data_loss", "$avg_monthly_data_loss"] }, 
          35.0
        ] 
      } 
    } 
  },
  
  // 3. Sort by the maximum data loss in descending order
  { 
    $sort: { max_data_loss: -1 } 
  }
]);

// Zero $lookup (JOIN) since nodata_pct is already stored directly in the acquisitions collection!
// acquisitions' year and month fields were pre-extracted in the Python script, so we can just group by 
// them directly without any runtime calculations. Same for the platform field.

// --------------------------------------------------------------------------------------
// ---- 4th QUERY: City with above average vegetation events

// VEDERLA MEGLIO

db.land_analytics.aggregate([
  // 1. Step 1: Get the actual average for each specific month/year
  { 
    $group: {
      _id: { 
        city_name: "$city_name", 
        acq_year: "$acq_year", 
        acq_month: "$acq_month" 
      },
      avg_veg: { $avg: "$vegetation_pct" },
      // image_count: { $sum: 1 } // Optional, matches the SQL COUNT
    }
  },
  
  // 3. Step 2: Compute the historical baseline for that month across all years
  // $setWindowFields acts like SQL Window functions (PARTITION BY). It keeps the individual rows, calculates th average
  // for each month across all years, and adds it as a new field called baseline_avg to each document. 
  // So every document will have both the actual average for that specific month/year and the historical baseline for that month.
  { 
    $setWindowFields: {
      partitionBy: { 
        city_name: "$_id.city_name", 
        month: "$_id.acq_month" 
      },
      output: { 
        baseline_avg: { $avg: "$avg_veg" } 
      }
    }
  },
  
  // 4. Filter where the actual average beats the baseline (your SQL WHERE clause)
  { 
    $match: { 
      $expr: { $gt: ["$avg_veg", "$baseline_avg"] } 
    } 
  },
  
  // 5. Count the occurrences
  { 
    $group: {
      _id: "$_id.city_name",
      total_above_average_months: { $sum: 1 }
    }
  },
  
  // 6. Sort results
  { 
    $sort: { total_above_average_months: -1 } 
  }
]);

// Zero $lookup (JOIN) since city_name and vegetation_pct are both stored directly in the land_analytics collection!
// We use $setWindowFields to calculate the historical baseline for each month across all years without needing to do 
// any complex subqueries or self-joins. 
// Then we filter for the months where the actual average vegetation is greater than the baseline and count those occurrences by city.

// ---------------------------------------------------------------------------------------
// ---- 5th QUERY: Data and quality images extractor ----

// We created an index using acquisitions.acquisition_date and clouds.total_obscuration
// to speed up the filtering by date first and cloud coverage then. 

db.acquisitions.createIndex({ 
  "acquisition_date": 1, 
  "clouds.total_obscuration": 1 
});

db.acquisitions.aggregate([
  // 1. Filter by the date range and our pre-calculated cloud obscuration
  { 
    $match: { 
      acquisition_date: { 
        $gte: "2023-07-01", 
        $lte: "2023-08-31" 
      },
      // We use the pre-calculated field; $lt means "less than", so we're filtering for images with total obscuration less than 15%
      "clouds.total_obscuration": { $lt: 15.0 }
    }
  },
  
  // 2. Unwind the images array. This takes the individual images out of their "folder" 
  // so they become flat, individual rows in our result.
  { $unwind: "$images" },
  
  // 3. Select exactly which columns (fields) we want to output
  { 
    $project: {
      _id: 0, // 0 tells MongoDB to hide the default ID field
      band_name: "$images.band_name",
      file_url: "$images.file_url"
    }
  }
]).explain("executionStats");

// Since the clouds and acquisition date are stored directly in the acquisitions collection, 
// we can filter by them directly in the $match stage without needing to do any joins or runtime calculations.

// - TIME EXECUTION: executionTimeMillis: NumberInt('4') before index, NumberInt('1') after index


// ---------------------------------------------------------------------------------------
// ---- 6th QUERY: Satellite performance comparison ----
// here we have a $lookup because we need to get data both from acquisitions (for the nodata_pct) and from land_analytics (for the vegetation_pct).

// INDEXES; 1 means sort the index in ascending order. This will speed up the $lookup stage since MongoDB can quickly find the matching acquisition_id in both collections without having to do a full scan.
db.acquisitions.createIndex({ "acquisition_id": 1 });
db.land_analytics.createIndex({ "acquisition_id": 1 });

db.acquisitions.aggregate([
  // 1. "NATURAL JOIN" - connect the acquisitions collection to the land_analytics collection
  { 
    $lookup: { 
      from: "land_analytics", 
      localField: "acquisition_id", 
      foreignField: "acquisition_id", 
      as: "land" 
    } 
  },
  
  // 2. Flatten the joined array so we can access the land fields easily
  { $unwind: "$land" },
  
  // 3. Group by the satellite platform
  { 
    $group: {
      _id: "$platform", 
      
      total_acquisitions: { $sum: 1 }, // To count the rows. Equivalent to COUNT(a.acquisition_id)
      
      avg_water: { $avg: "$land.water_pct" },
      avg_vegetation: { $avg: "$land.vegetation_pct" },
      avg_not_vegetated: { $avg: "$land.not_vegetated_pct" },
      avg_snow: { $avg: "$land.snow_pct" },
      avg_dark_area: { $avg: "$land.dark_area_pct" },
      
      avg_nodata: { $avg: "$nodata_pct" },
      avg_unclassified: { $avg: "$unclassified" }
    }
  },
  
  // 4. Equivalent to SQL's HAVING clause (filter after grouping)
  // if you use $match at the beginning of the pipeline, it would filter before grouping (like a SQL WHERE clause), 
  // but here we want to filter after grouping, so we use $match at the end (like a SQL HAVING clause).
  { 
    $match: { 
      total_acquisitions: { $gt: 10 } 
    } 
  },
  
  { 
    $sort: { total_acquisitions: 1 } 
  }
]).explain("executionStats");

// The $lookup allows us to connect the two collections together using the acquisition_id as a common key.
// Without using an index on acquisition_id, this query would be very slow because MongoDB would have to do 
// a full scan of both collections to find the matches.

// - TIME EXECUTION: executionTimeMillis: NumberInt('6056') before index, NumberInt('591') after index

// Creating the index on acquisition_id allows MongoDB to quickly find the matching documents in both collections, 
// which significantly reduces the execution time of the query.

// ---------------------------------------------------------------------------------------
// ---- 7th QUERY: Optimal water visibility ----

// Also here we speed up the query with indexes on acquisition_id since we need to join 
// land_analytics with acquisitions to get the water_pct and the illuminance data together.
// Furthermore, we created an index on water_pct in land_analytics to quickly filter for good water conditions.

db.land_analytics.createIndex({ "water_pct": 1 });

db.land_analytics.aggregate([
  // 1. SET A: Find images with good water
  { 
    $match: { water_pct: { $gt: 30 } } 
  },
  
  // 2. We need to check the lighting, so we grab the rest of the data from 'acquisitions'
  { 
    $lookup: {
      from: "acquisitions",
      localField: "acquisition_id",
      foreignField: "acquisition_id",
      as: "acq_data"
    }
  },

  // 3. Unwind the joined data so we can filter by the illuminance fields
  { $unwind: "$acq_data" },
  
  // 4. The EXCEPT logic: Filter out the bad lighting and bad orbits.
  // Instead of subtracting them later, we just enforce the POSITIVE conditions right now.
  { 
    $match: {
      // Must be greater than or equal to 30 (opposite of < 30)
      "acq_data.illuminance.sun_elevation": { $gte: 30 },
      
      // Must NOT equal 'ascending'
      "acq_data.illuminance.orbit_state": { $ne: "ascending" }
    }
  },
  
  // 5. Select only the columns you asked for in your SQL query
  { 
    $project: { 
      _id: 0, 
      acquisition_id: 1, 
      acquisition_date: 1 
    } 
  }
]).explain("executionStats");

// In this query, we simply look for the good stuff right away instead of trying to find the bad stuff and then subtract it later. We start by filtering for good water conditions, then we join with acquisitions to get the lighting and orbit data, and then we apply the positive conditions for good lighting and orbits directly in the $match stage. This way, we don't need to do any complex set operations or subqueries to exclude the bad conditions later on.
// We filter for good water conditions first, then we join with acquisitions to get 
// the lighting and orbit data, and then we apply the positive conditions for good 
// lighting and orbits directly in the $match stage. 
// This way, we don't need to do any complex set operations or subqueries to exclude the bad conditions later on. 
// We just enforce the good conditions from the start!

// - TIME EXECUTION: executionTimeMillis: NumberInt('295') before index, NumberInt('266') after index

// ---------------------------------------------------------------------------------------
// ---- 8th QUERY: Image scientific field classification ----

db.acquisitions.aggregate([
  // 1. Unwind the images array so we can evaluate each image band individually.
  // Creates a new document for each image in the images array, allowing us to filter and classify them based on their band_name.
  { $unwind: "$images" },
  
  // 2. The WHERE clause: Filter only for the bands we care about
  { 
    $match: { 
      "images.band_name": { $in: ["B02", "B03", "B04", "B08"] } 
    } 
  },
  
  // 3. The CASE WHEN equivalent: Create the classification label
  { 
    $project: {
      platform: 1, // Keep the platform field into the final result
      scientific_application: {
        $switch: {
          branches: [
            { 
              case: { $eq: ["$images.band_name", "B02"] }, 
              then: "Water & Costal Analysis (B02)" 
            },
            { 
              case: { $eq: ["$images.band_name", "B03"] }, 
              then: "Vegetation & Urban Analysis (B03)" 
            },
            { 
              // $in checks if the band is either B04 OR B08
              case: { $in: ["$images.band_name", ["B04", "B08"]] }, 
              then: "Healthy Green Vegetation Analysis (B04 & B08)" 
            }
          ],
          default: "Other" 
        }
      }
    }
  },
  
  // 4. Group by platform and our newly created classification
  { 
    $group: {
      _id: { 
        platform: "$platform", 
        scientific_application: "$scientific_application" 
      },
      total_files: { $sum: 1 } // COUNT(i.band_name)
    }
  },
  
  // 5. Clean up the output to match your exact SQL SELECT format
  {
    $project: {
      _id: 0,
      platform: "$_id.platform",
      scientific_application: "$_id.scientific_application",
      total_files: 1
    }
  },
  
  // 6. Sort for clean presentation
  { 
    $sort: { platform: 1, scientific_application: 1 } 
  }
]);

// No $lookup because all necessary data is already into acquisitions. 
// We unwind the images array to evaluate each image separately, filter by the bands we care about, 
// create a new field for the scientific application using $switch (CASE WHEN), 
// and then group by both platform and scientific application to get our counts.

// ---------------------------------------------------------------------------------------
// ---- 9th QUERY: Images extraction via cloud filtering ----

// We created an index on clouds.high_proba_clouds to instantly find images with good clouds
db.acquisitions.createIndex({ "clouds.high_proba_clouds": 1 });

// We use .find instead of aggregate since we don't need to do any grouping or complex transformations, 
// just a simple search.
db.acquisitions.find(
  
  // 1. The WHERE clause
  { 
    "clouds.high_proba_clouds": { $lte: 50 } // $lte means "less than or equal to"
  },
  
  // 2. The SELECT clause (The Projection)
  { 
    _id: 0, 
    acquisition_id: 1, 
    acquisition_date: 1, 
    platform: 1 
  }
).explain("executionStats");

// Since the clouds data is stored directly in the acquisitions collection, 
// we can just filter by it directly in the .find() method without needing 
// to do any joins or complex transformations.

// - TIME EXECUTION: executionTimeMillis: NumberInt('5') before index, NumberInt('2') after index

// ---------------------------------------------------------------------------------------
// ---- 10th QUERY: Greenest year ----

db.land_analytics.aggregate([
  // 1. Group by our pre-calculated Year
  { 
    $group: {
      _id: "$acq_year", 
      total_acquisitions: { $sum: 1 },
      avg_vegetation: { $avg: "$vegetation_pct" }
    }
  },
  
  // 2. Sort by the highest vegetation average (DESC)
  { 
    $sort: { avg_vegetation: -1 } 
  },
  
  // 3. Keep only the very first row
  { 
    $limit: 1 
  },
  
  // 4. Clean up the output to match your SQL exact column names
  {
    $project: {
      _id: 0,
      best_acquisition_year: "$_id",
      total_acquisitions: 1,
      avg_vegetation: 1
    }
  }
]);

// Since the year was pre-calculated in the Python script and stored directly 
// in the land_analytics collection, we can just group by it directly without 
// needing to do any runtime calculations (EXTRACT before GROUP BY statement for the SQL version). 
// Then we sort by the average vegetation in descending order and limit the result 
// to just the top row to get the greenest year.