const asyncHandler = (reqHandler) => (req, res, next) => {
  return Promise.resolve(reqHandler(req, res, next)).catch(next);
};

export default asyncHandler;