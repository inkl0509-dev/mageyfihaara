# 🥟 Magey Fihaara — billing app for small snack sellers

All prices, bills and accounts are in **MVR (Maldivian Rufiyaa)**.

A phone app for selling samosas, rolls, chai and other snacks. It runs in the phone's browser and can be added to the home screen. It uses **Firebase** for login and data, the code lives on **GitHub**, and it is hosted on **Vercel** for free.

## Features
- **Many shops, one app**: the admin creates shops and each shop gets a secret code (e.g. `K7PM-3QXD`). A seller creates a login, types the code once, and becomes part of that shop. **Shops can never see each other's data.** This is enforced by Firebase security rules on the server, not just hidden in the app. The admin sees shop names, codes and logged-in phones, but **not** the shops' sales, items or accounts.
- **Items**: add name, sale price, cost price, photo and barcode. You can scan an existing barcode or make a new one and print labels.
- **Sell screen**: shows item photos. Tap an item to add 1. Hold an item to type a quantity. You can also search by name, scan with the camera (scanning many items in a row works), or use a USB/Bluetooth barcode gun.
- **Bill**: change quantities with + and −, add a discount, see the total, and choose **Cash** (it works out the change) or **Transfer** (with an optional reference).
- **WhatsApp bill**: send the receipt to the customer's number (type the 7-digit Maldives number, e.g. 7771234, and it becomes 9607771234). Bills can also be printed on a 58 mm printer.
- **Accounts**: choose Today, Yesterday, 7 days, This month or your own dates. It shows total sales, number of bills, cash vs transfer, discounts, cost, expenses, gross profit, net profit, top items and the list of bills. You can open any bill to resend it or delete it, and download a CSV file for Excel.
- **Tax (GST) invoice, only when you need it**: tick **🧾 Tax invoice** on the bill screen, or make every bill a tax invoice in Settings. The bill then shows "TAX INVOICE", your registered business name and **TIN**, the customer's TIN (optional), the taxable value, **GST** and the total. GST is worked out **after** any discount. In Settings you set the **GST rate** (default 8%) and choose whether your prices **already include GST** or GST is **added on top**. Accounts shows the GST collected and keeps it out of your profit. Check with MIRA or your accountant that the invoice meets your exact needs.
- **💸 Expenses tab**: enter the amount, tap a category (Ingredients, Oil, Gas, Rent, Electricity, Water, Salary, Transport, Packaging, Other), add details, choose the date (you can enter past days) and Cash or Transfer. If the supplier gave a **GST invoice**, tick it: the GST is worked out automatically (editable), and you can add the supplier name, TIN and invoice no. Shows the month's total, cash vs transfer, GST paid and totals by category.
- **🧾 GST report** (Accounts → GST report): this month, last month, this quarter, last quarter or custom dates. Shows **output GST** (collected on tax invoices), **input GST** (paid on purchases), **GST to pay MIRA** (or refundable), taxable sales and purchases, and lists every sales tax invoice and purchase. Download it as CSV or print it. Check the figures with MIRA or your accountant before filing.
- **🏦 Bank accounts on bills**: add BML, MIB or other accounts in Settings. They show on every bill. On the receipt screen:
  - **📸 Send photo bill**: sends a picture of the bill through the phone's share menu (choose WhatsApp, then the customer). The message caption is **only the account number**, so the customer long-presses → Copy and pastes it into their bank app.
  - **🏦 Send account no.**: sends a separate WhatsApp message to the customer's number with just the account number, for easy copying.
  - **📋 Copy account no.**, **💬 Text bill**, **⬇ Save photo** and **🖨 Print**.
  - If the shop has more than one account, tap which one to send.
- **ދިވެހި / English**: tap **ދިވެހި** at the top to switch to Dhivehi, and each phone remembers its choice. It uses the same words as the Naalu app. Dhivehi text uses the **Faruma** font: put `faruma.ttf` in the `fonts` folder (see `fonts/README.txt`). Phones without it use the free Noto Sans Thaana font.
- **Works offline**: sales are saved on the phone and sync when the internet comes back.
- **Login per shop**: each seller sees only their own data.

## Setup (about 15 minutes)

### 1. Firebase
1. Go to https://console.firebase.google.com and click **Add project**.
2. Open **Build → Authentication → Get started** and turn on **Email/Password**.
3. Open **Build → Firestore Database → Create database** and choose **Production mode**. Pick a nearby region.
4. In **Firestore → Rules**, paste everything from `firestore.rules` and click **Publish**.
   (If you used an older version of this app, delete the old test data first. The data layout has changed.)
5. Open **Project settings (⚙️) → Your apps → Web (</>)** and register an app. Copy the `firebaseConfig` values into `firebase-config.js`.

> Photos are made small and saved inside Firestore, so you **don't need** Firebase Storage. Storage needs a paid plan, but this app works on the free Spark plan.

### 2. GitHub
```bash
git init
git add .
git commit -m "Magey Fihaara"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/magey-fihaara.git
git push -u origin main
```

### 3. Vercel
1. Go to https://vercel.com, sign in with GitHub, click **Add New → Project** and import `magey-fihaara`.
2. Set Framework Preset to **Other**. No build command is needed. Click **Deploy**.
3. Copy your link, for example `magey-fihaara.vercel.app`.
4. Back in Firebase, open **Authentication → Settings → Authorized domains** and add that domain.

Every `git push` updates the live app automatically.

### 4. Admin login (one time)
The app owner is **iirufan@gmail.com**. Only this email can create shop codes.
1. Open the app and press **Create new account** with `iirufan@gmail.com` and a password.
2. The app shows **Verify admin email**. Press **Send verification link**.
3. Open that Gmail inbox (check Spam), tap the link, then go back to the app and press **I clicked the link ✔**.
4. The **Admin** screen opens. After this, logging in with that email always opens Admin.

> Why verify? Anyone can type any email when signing up, so admin powers only switch on after Gmail proves the address is really yours.
> To change the admin email, edit `ADMIN_EMAIL` in `app.js` **and** the email in `firestore.rules`, then publish the rules again.

### 5. Open a shop
1. On the Admin screen, type the shop name and click **+ Create**. A code appears.
2. Click **Share code** to send it on WhatsApp to the shop owner.
3. The owner opens the app on their phone, creates an account and enters the code. That shop now works only for them.
4. A helper's phone can join the **same shop** with the same code.

**Admin buttons**
- **New code**: the old code stops working for new phones. Phones already in the shop keep working.
- **Turn off / Turn on**: blocks or unblocks the whole shop, for example if they haven't paid.
- **✕ next to a phone**: removes that phone from the shop. It will need a code again.

### 6. Use it on the phone
- Open the Vercel link in **Chrome** (Android) or **Safari** (iPhone).
- Choose **Menu → Add to Home screen**. It will open like a normal app.
- Create an account, set your shop name in **⚙️ Settings**, then add items in **📦 Items**.

## Files
| File | What it does |
|---|---|
| `index.html` | Screens and pop-ups |
| `app.js` | All app logic |
| `style.css` | Mobile design |
| `firebase-config.js` | Your Firebase keys (edit this) |
| `firestore.rules` | Security: each shop sees only its own data |
| `manifest.json`, `icons/` | Home-screen app icon |

## Data layout (Firestore)
```
admins/{userId}               → who is admin (you create this by hand)
codes/{CODE}                  → shopId (secret join codes)
users/{userId}                → shopId this phone/user belongs to
shops/{shopId}                → shop name, phone, address, footer, code, active
shops/{shopId}/items/{id}     → name, price, cost, barcode, photo      (only this shop's users)
shops/{shopId}/sales/{id}     → bills                                  (only this shop's users)
shops/{shopId}/expenses/{id}  → expenses                               (only this shop's users)
```

## Notes
- The camera scanner only works on **https**. Vercel uses https, so it works there.
- The free Firebase plan allows 50,000 reads and 20,000 writes per day, which is plenty for a small shop.
- One login belongs to one shop. To sell in two shops, use two different emails.
