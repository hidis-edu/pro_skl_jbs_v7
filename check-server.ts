import axios from "axios";

async function check() {
  try {
    const res = await axios.get("http://localhost:3000/api/system-settings");
    console.log("SERVER_SETTINGS:", JSON.stringify(res.data));
  } catch (err) {
    console.error("CHECK_ERROR:", err);
  }
}

check();
