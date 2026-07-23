// import { ILogger } from "../interfaces";

// // WERSJA DEV - Zaawansowana klasa
// export class DevLogger implements ILogger {
//   log(data: unknown) {
//     console.log("[DEV LOGGER]:", data);
//     // Tutaj cała Twoja magia debugowania
//     const div = document.createElement("div");
//     div.textContent = String(data);
//     div.style.position = "absolute";
//     div.style.top = "0";
//     document.body.appendChild(div);
//   }
// }

// // WERSJA PROD - Płaski obiekt
// export const prodLogger: ILogger = {
//   log: () => {},
// };
