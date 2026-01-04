exports.getExample = (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Hello from the MVC server!',
        data: {
            timestamp: new Date().toISOString()
        }
    });
};

exports.createExample = (req, res) => {
    res.status(201).json({
        status: 'success',
        message: 'Example created successfully',
        data: req.body
    });
};
