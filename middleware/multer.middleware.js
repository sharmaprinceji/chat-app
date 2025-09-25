import multer from "multer";

const Storage=multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "../store/temp");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: Storage });
export default upload;